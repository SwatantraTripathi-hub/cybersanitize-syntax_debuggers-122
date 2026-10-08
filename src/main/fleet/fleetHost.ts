/**
 * FleetHost — WebSocket server that acts as the fleet command centre.
 *
 * The orchestrating machine runs FleetHost on port 4096.
 * Client nodes connect via FleetClient and send JOIN_ROOM,
 * then receive commands (PRE_SCAN_REQ, EXEC_WIPE, etc.) and
 * stream back TELEMETRY + JOB_COMPLETE packets.
 *
 * The host emits Node.js EventEmitter events so that the IPC layer
 * can forward real-time updates to the renderer process.
 */

import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Socket as DatagramSocket } from "node:dgram";
import { startFleetDiscoveryResponder } from "./fleetDiscovery";
import {
  FleetMessageType,
  type FleetPacket,
  type ConnectedNode,
  type JoinRoomPayload,
  type TelemetryPayload,
  type PreScanFindingsPayload,
  type FleetWorkspaceMeta,
  type JobCompletePayload,
  type ExecuteWipePayload,
  type ExecuteRecoveryPayload,
  type FleetDriveDescriptor,
} from "./lobbyProtocol";

export interface FleetHostEvents {
  "node:joined": (node: ConnectedNode) => void;
  "node:prescan_ready": (node: ConnectedNode) => void;
  "node:telemetry": (data: {
    nodeId: string;
    telemetry: TelemetryPayload;
  }) => void;
  "node:completed": (data: {
    nodeId: string;
    result: JobCompletePayload;
  }) => void;
  "node:disconnected": (nodeId: string) => void;
  "host:started": (port: number) => void;
  "host:stopped": () => void;
  "host:error": (err: Error) => void;
}

declare interface FleetHost {
  on<K extends keyof FleetHostEvents>(
    event: K,
    listener: FleetHostEvents[K],
  ): this;
  emit<K extends keyof FleetHostEvents>(
    event: K,
    ...args: Parameters<FleetHostEvents[K]>
  ): boolean;
}

class FleetHost extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private discoverySocket: DatagramSocket | null = null;
  private nodes: Map<string, ConnectedNode> = new Map();
  private sockets: Map<string, WebSocket> = new Map();
  private activeRoomKey: string = "";
  private port: number = 4096;
  private activeWorkspaceMeta: FleetWorkspaceMeta | null = null;

  /**
   * Set active workspace configuration metadata for joining nodes.
   */
  setWorkspaceMeta(meta: FleetWorkspaceMeta): void {
    this.activeWorkspaceMeta = meta;
  }

  getWorkspaceMeta(): FleetWorkspaceMeta | null {
    return this.activeWorkspaceMeta;
  }

  /**
   * Start the WebSocket server and return the room key.
   */
  createLobby(port = 4096): Promise<string> {
    if (this.wss) {
      this.closeLobby();
    }

    this.port = port;
    this.activeRoomKey = `CS-FLEET-${Math.floor(1000 + Math.random() * 9000)}`;

    this.wss = new WebSocketServer({ port, host: "0.0.0.0" });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const clientIp = req.socket.remoteAddress ?? "0.0.0.0";
      console.log(`[FleetHost] New connection from ${clientIp}`);
      this._handleConnection(ws, clientIp);
    });

    this.wss.on("error", (err: Error) => {
      console.error("[FleetHost] Server error:", err.message);
      this.emit("host:error", err);
    });

    this.wss.on("listening", () => {
      console.log(
        `[FleetHost] Listening on ws://0.0.0.0:${port} — Room: ${this.activeRoomKey}`,
      );
      this.emit("host:started", port);
    });

    return new Promise((resolve, reject) => {
      const server = this.wss;
      if (!server) {
        reject(new Error("Fleet host server failed to initialize."));
        return;
      }

      const onListening = () => {
        server.removeListener("error", onStartupError);
        void startFleetDiscoveryResponder(
          () => this.activeRoomKey,
          () => this.port,
        )
          .then((socket) => {
            this.discoverySocket = socket;
            resolve(this.activeRoomKey);
          })
          .catch((error: Error) => {
            this.closeLobby();
            reject(error);
          });
      };
      const onStartupError = (err: Error) => {
        server.removeListener("listening", onListening);
        this.wss = null;
        reject(err);
      };

      server.once("listening", onListening);
      server.once("error", onStartupError);
    });
  }

  /**
   * Handle an individual WebSocket connection lifecycle.
   */
  private _handleConnection(ws: WebSocket, clientIp: string): void {
    let registeredNodeId: string | null = null;

    ws.on("message", (raw: Buffer | string) => {
      try {
        const packet: FleetPacket = JSON.parse(raw.toString());

        if (packet.roomKey !== this.activeRoomKey) {
          console.warn(
            `[FleetHost] Rejecting packet for invalid room: ${packet.roomKey}`,
          );
          if (packet.type === FleetMessageType.JOIN_ROOM) {
            this._send(ws, {
              type: FleetMessageType.ROOM_REJECTED,
              nodeId: "host",
              roomKey: this.activeRoomKey,
              timestamp: new Date().toISOString(),
              payload: { reason: "Invalid room key" },
            });
          }
          ws.close();
          return;
        }
        if (registeredNodeId && packet.nodeId !== registeredNodeId) {
          console.warn(
            `[FleetHost] Rejecting packet with mismatched node identity: ${packet.nodeId}`,
          );
          ws.close();
          return;
        }

        switch (packet.type) {
          case FleetMessageType.JOIN_ROOM: {
            const payload = packet.payload as JoinRoomPayload;

            registeredNodeId = payload.nodeId;
            const previousSocket = this.sockets.get(payload.nodeId);
            if (previousSocket && previousSocket !== ws) {
              previousSocket.terminate();
            }
            const node: ConnectedNode = {
              nodeId: payload.nodeId,
              hostname: payload.hostname,
              ip: clientIp,
              mac: payload.mac,
              model: payload.model,
              storage: payload.storage,
              drives: payload.drives || [],
              platform: payload.platform,
              connectedAt: new Date().toISOString(),
              status: "ONLINE",
              progress: 0,
              speed: "0 MB/s",
              eta: "--",
              lastLog: `Connected from ${clientIp} over local LAN WebSocket.`,
            };

            this.nodes.set(payload.nodeId, node);
            this.sockets.set(payload.nodeId, ws);

            // Acknowledge with full workspace metadata and central configuration
            this._send(ws, {
              type: FleetMessageType.ROOM_ACCEPTED,
              nodeId: "host",
              roomKey: this.activeRoomKey,
              timestamp: new Date().toISOString(),
              payload: {
                roomKey: this.activeRoomKey,
                hostVersion: "1.0.0",
                connectedPeers: this.nodes.size,
                workspaceMeta: this.activeWorkspaceMeta || {
                  caseId: `FLEET-${this.activeRoomKey}`,
                  title: "Central Fleet Mesh Workspace",
                  evidenceTag: `AST-${this.activeRoomKey}`,
                  authorizingOfficer: "Lead Administrator / Central Fleet Hub",
                  date: new Date().toISOString().split("T")[0],
                  notes:
                    "Air-gapped multi-device fleet workspace orchestrating parallel client workstations.",
                  classification: "ENTERPRISE FLEET / NIST 800-88 REV 1",
                  selectedOptions: {
                    wipeStandard: "nist-clear",
                    recoveryTypes: ["DOCX", "PDF", "SQLITE"],
                    writeBlockerEnforced: true,
                    preScanEnabled: true,
                  },
                },
              },
            });

            this.emit("node:joined", node);
            console.log(
              `[FleetHost] Node joined: ${payload.hostname} (${payload.nodeId})`,
            );
            break;
          }

          case FleetMessageType.TELEMETRY: {
            if (!registeredNodeId) break;
            const telemetry = packet.payload as TelemetryPayload;
            const node = this.nodes.get(registeredNodeId);
            if (node) {
              node.progress = telemetry.progress;
              node.speed = telemetry.speed;
              node.eta = telemetry.eta;
              node.lastLog = telemetry.logLine;
              node.status = telemetry.phase as ConnectedNode["status"];
              this.nodes.set(registeredNodeId, node);
            }
            this.emit("node:telemetry", {
              nodeId: registeredNodeId,
              telemetry,
            });
            break;
          }

          case FleetMessageType.PRE_SCAN_RESULT: {
            if (!registeredNodeId) break;
            const findings = packet.payload as PreScanFindingsPayload;
            const node = this.nodes.get(registeredNodeId);
            if (node) {
              node.preScanFindings = findings;
              node.status = "IDLE";
              node.progress = 100;
              node.lastLog = "Pre-Scan Complete: Inventory cataloged.";
              this.nodes.set(registeredNodeId, node);
            }
            this.emit(
              "node:prescan_ready",
              this.nodes.get(registeredNodeId) ?? node!,
            );
            break;
          }

          case FleetMessageType.JOB_COMPLETE: {
            if (!registeredNodeId) break;
            const result = packet.payload as JobCompletePayload;
            const node = this.nodes.get(registeredNodeId);
            if (node) {
              node.status = result.success
                ? (result.operation === "WIPE" ? "VERIFIED" : "IDLE")
                : "FAILED";
              node.progress = 100;
              node.speed = "0 MB/s";
              node.eta = "Completed";
              node.lastLog = result.summary;
              this.nodes.set(registeredNodeId, node);
            }
            this.emit("node:completed", { nodeId: registeredNodeId, result });
            break;
          }

          case FleetMessageType.HEARTBEAT: {
            // Respond to keep connections alive
            this._send(ws, {
              type: FleetMessageType.HEARTBEAT,
              nodeId: "host",
              roomKey: this.activeRoomKey,
              timestamp: new Date().toISOString(),
              payload: {},
            });
            break;
          }

          default:
            console.warn(`[FleetHost] Unknown message type: ${packet.type}`);
        }
      } catch (err) {
        console.error("[FleetHost] Failed to parse packet:", err);
      }
    });

    ws.on("close", () => {
      if (registeredNodeId && this.sockets.get(registeredNodeId) === ws) {
        this.nodes.delete(registeredNodeId);
        this.sockets.delete(registeredNodeId);
        this.emit("node:disconnected", registeredNodeId);
        console.log(`[FleetHost] Node disconnected: ${registeredNodeId}`);
      }
    });

    ws.on("error", (err: Error) => {
      console.warn(
        `[FleetHost] Socket error for ${registeredNodeId}: ${err.message}`,
      );
    });
  }

  /**
   * Broadcast a PRE_SCAN_REQ to all connected (selected) nodes.
   */
  broadcastPreScan(
    nodeIds?: string[],
    targetPathByNode?: Record<string, string>,
  ): number {
    const targets = nodeIds || Array.from(this.sockets.keys());
    let dispatched = 0;
    for (const nodeId of targets) {
      dispatched += this._broadcastToNodes([nodeId], FleetMessageType.PRE_SCAN_REQ, {
        targetPath: targetPathByNode?.[nodeId],
      });
    }
    console.log(
      `[FleetHost] Pre-scan request broadcast to ${nodeIds?.length ?? this.nodes.size} nodes`,
    );
    return dispatched;
  }

  /**
   * Broadcast an EXEC_WIPE command to selected nodes.
   */
  broadcastWipe(
    standard: string,
    nodeIds?: string[],
    targetPathByNode?: Record<string, string>,
  ): number {
    const targets = nodeIds || Array.from(this.sockets.keys());
    let dispatched = 0;
    for (const nodeId of targets) {
      const payload: ExecuteWipePayload = {
        standard,
        targetPath: targetPathByNode?.[nodeId],
      };
      dispatched += this._broadcastToNodes([nodeId], FleetMessageType.EXEC_WIPE, payload);
    }
    console.log(
      `[FleetHost] Wipe (${standard}) broadcast to ${nodeIds?.length ?? this.nodes.size} nodes`,
    );
    return dispatched;
  }

  /**
   * Broadcast an EXEC_RECOVERY command to selected nodes.
   */
  broadcastRecovery(
    fileTypes: string[],
    nodeIds?: string[],
    sourcePathByNode?: Record<string, string>,
  ): number {
    const targets = nodeIds || Array.from(this.sockets.keys());
    let dispatched = 0;
    for (const nodeId of targets) {
      const payload: ExecuteRecoveryPayload = {
        fileTypes,
        sourcePath: sourcePathByNode?.[nodeId],
      };
      dispatched += this._broadcastToNodes([nodeId], FleetMessageType.EXEC_RECOVERY, payload);
    }
    return dispatched;
  }

  /**
   * Broadcast a message to all nodes (or a subset by nodeId).
   */
  private _broadcastToNodes(
    nodeIds: string[] | undefined,
    type: FleetMessageType,
    payload: unknown,
  ): number {
    const targets = nodeIds
      ? [...this.sockets.entries()].filter(([id]) => nodeIds.includes(id))
      : [...this.sockets.entries()];

    let dispatched = 0;
    for (const [nodeId, ws] of targets) {
      if (ws.readyState === WebSocket.OPEN) {
        this._send(ws, {
          type,
          nodeId: "host",
          roomKey: this.activeRoomKey,
          timestamp: new Date().toISOString(),
          payload,
        });
        dispatched += 1;
      } else {
        console.warn(`[FleetHost] Skipping closed socket for node ${nodeId}`);
      }
    }
    return dispatched;
  }

  /**
   * Send a typed packet to a single WebSocket.
   */
  private _send(ws: WebSocket, packet: FleetPacket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  }

  /**
   * Get all currently connected nodes as an array.
   */
  getConnectedNodes(): ConnectedNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get a single node by ID.
   */
  getNode(nodeId: string): ConnectedNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get the current room key.
   */
  getRoomKey(): string {
    return this.activeRoomKey;
  }

  /**
   * Get the active port.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Shut down the WebSocket server and disconnect all nodes.
   */
  closeLobby(): void {
    if (this.discoverySocket) {
      this.discoverySocket.close();
      this.discoverySocket = null;
    }

    if (this.wss) {
      // Close all sockets
      for (const [nodeId, ws] of this.sockets.entries()) {
        try {
          this._send(ws, {
            type: FleetMessageType.DISCONNECT,
            nodeId: "host",
            roomKey: this.activeRoomKey,
            timestamp: new Date().toISOString(),
            payload: { reason: "Host closing lobby" },
          });
          ws.terminate();
        } catch {
          // ignore close errors
        }
        this.emit("node:disconnected", nodeId);
      }

      this.wss.close(() => {
        console.log("[FleetHost] Server closed.");
        this.emit("host:stopped");
      });

      this.wss = null;
      this.nodes.clear();
      this.sockets.clear();
      this.activeRoomKey = "";
      this.activeWorkspaceMeta = null;
    }
  }

  /**
   * Check if the host is currently running.
   */
  isRunning(): boolean {
    return this.wss !== null;
  }
}

export { FleetHost };
export default FleetHost;
