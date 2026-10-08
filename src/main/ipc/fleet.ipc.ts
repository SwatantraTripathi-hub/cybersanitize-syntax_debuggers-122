import { ipcMain, BrowserWindow } from "electron";
import { FleetHost } from "../fleet/fleetHost";
import { FleetClient } from "../fleet/fleetClient";
import { discoverFleetHost } from "../fleet/fleetDiscovery";
import { AuditService } from "../services/auditService";

let fleetHostInstance: FleetHost | null = null;
let fleetClientInstance: FleetClient | null = null;

export function registerFleetIpc(
  mainWindow: BrowserWindow,
  auditService?: AuditService,
): void {
  // 1. Create Fleet Host Lobby
  ipcMain.handle("fleet:create-lobby", async (_, port: number = 4096) => {
    try {
      if (!fleetHostInstance) {
        fleetHostInstance = new FleetHost();
      }

      // Forward fleet host events directly to renderer window
      fleetHostInstance.removeAllListeners();

      fleetHostInstance.on("node:joined", (node) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-joined", node);
        }
      });

      fleetHostInstance.on("node:prescan_ready", (node) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-prescan", node);
        }
      });

      fleetHostInstance.on("node:telemetry", (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:telemetry", data);
        }
      });

      fleetHostInstance.on("node:completed", (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-complete", data);
        }
        if (auditService) {
          try {
            const node = fleetHostInstance?.getNode(data.nodeId);
            const result = data.result as any;
            auditService.logOperation({
              timestamp: new Date().toISOString(),
              operation: (result.operation === "RECOVERY"
                ? "FILE_RECOVERY"
                : "DRIVE_WIPE") as any,
              target: `Fleet Node: ${data.nodeId || "Node"} (${node?.hostname || node?.ip || "Remote"})`,
              details: {
                systemHost: node?.hostname,
                nodeId: data.nodeId,
                ip: node?.ip,
                status: result.success ? "COMPLETED" : "FAILED",
                standard: result.standard || "nist-clear",
                fleetCluster: true,
              },
              status: result.success ? "VERIFIED" : "FAILED",
              operator: "FLEET_ORCHESTRATOR",
              hash_before: result.preHash || null,
              hash_after: result.postHash || null,
              verification_result: result.verification || {
                verified: result.success,
              },
            });
          } catch (_) {}
        }
      });

      fleetHostInstance.on("node:disconnected", (nodeId) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-disconnected", nodeId);
        }
      });

      const roomCode = await fleetHostInstance.createLobby(port);
      return { success: true, roomCode, port };
    } catch (err: any) {
      console.error("[FleetIPC] Error creating lobby:", err);
      return { success: false, error: err.message };
    }
  });

  // Set Workspace Meta for Lobby Host
  ipcMain.handle("fleet:set-workspace-meta", async (_, meta: any) => {
    if (fleetHostInstance) {
      fleetHostInstance.setWorkspaceMeta(meta);
      return { success: true };
    }
    return { success: false, error: "Host not running" };
  });

  // 2. Join Lobby as a Client Node
  ipcMain.handle("fleet:join-lobby", async (_, { roomCode, nodeId }) => {
    try {
      if (fleetClientInstance) {
        fleetClientInstance.disconnect();
      }
      fleetClientInstance = new FleetClient();

      const endpoint = await discoverFleetHost(roomCode);

      // Forward client received events to renderer
      fleetClientInstance.on("command_received", (type) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:client-command", type);
        }
      });
      fleetClientInstance.on("telemetry", (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:telemetry", data);
        }
      });
      fleetClientInstance.on("prescan_ready", (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-prescan", {
            nodeId: data.nodeId,
            preScanFindings: data.findings,
            lastLog: "Pre-Scan Complete: Inventory cataloged.",
          });
        }
      });
      fleetClientInstance.on("completed", (data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:node-complete", data);
        }
      });
      fleetClientInstance.on("disconnected", () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("fleet:client-disconnected");
        }
      });

      const result = await fleetClientInstance.joinLobby(
        endpoint.hostIp,
        endpoint.port,
        roomCode,
        nodeId,
      );
      return result;
    } catch (err: any) {
      console.error("[FleetIPC] Error joining lobby:", err);
      return { success: false, error: err.message };
    }
  });

  // 3. Broadcast Pre-Scan
  ipcMain.handle("fleet:broadcast-prescan", async (_, nodeIds?: string[]) => {
    if (fleetHostInstance) {
      fleetHostInstance.broadcastPreScan(nodeIds);
      return { success: true };
    }
    return { success: false, error: "Fleet host not running" };
  });

  // 4. Broadcast Wipe
  ipcMain.handle(
    "fleet:broadcast-wipe",
    async (_, standard: string, nodeIds?: string[]) => {
      if (fleetHostInstance) {
        fleetHostInstance.broadcastWipe(standard, nodeIds);
        return { success: true };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  // 5. Broadcast Recovery
  ipcMain.handle(
    "fleet:broadcast-recovery",
    async (_, fileTypes: string[], nodeIds?: string[]) => {
      if (fleetHostInstance) {
        fleetHostInstance.broadcastRecovery(fileTypes, nodeIds);
        return { success: true };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  // 6. Close Lobby
  ipcMain.handle("fleet:close-lobby", async () => {
    if (fleetHostInstance) {
      fleetHostInstance.closeLobby();
    }
    if (fleetClientInstance) {
      fleetClientInstance.disconnect();
      fleetClientInstance = null;
    }
    return { success: true };
  });

  ipcMain.handle("fleet:leave-client", async () => {
    if (fleetClientInstance) {
      fleetClientInstance.disconnect();
      fleetClientInstance = null;
    }
    return { success: true };
  });

  // 7. Get Connected Nodes
  ipcMain.handle("fleet:get-nodes", async () => {
    if (fleetHostInstance) {
      return fleetHostInstance.getConnectedNodes();
    }
    return [];
  });

  // 8. Get Host Status
  ipcMain.handle("fleet:get-status", async () => {
    if (fleetHostInstance && fleetHostInstance.isRunning()) {
      return {
        running: true,
        port: fleetHostInstance.getPort(),
        roomKey: fleetHostInstance.getRoomKey(),
        nodeCount: fleetHostInstance.getConnectedNodes().length,
      };
    }
    return { running: false };
  });
}
