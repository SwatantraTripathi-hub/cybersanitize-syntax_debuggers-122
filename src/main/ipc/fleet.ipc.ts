import { ipcMain, BrowserWindow } from "electron";
import { FleetHost } from "../fleet/fleetHost";
import { FleetClient } from "../fleet/fleetClient";
import { discoverFleetHost } from "../fleet/fleetDiscovery";
import { AuditService } from "../services/auditService";
import * as fs from "node:fs/promises";
import * as path from "node:path";

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
            const result = data.result;
            const node = fleetHostInstance?.getNode(data.nodeId);
            const workspace = fleetHostInstance?.getWorkspaceMeta();
            const operation =
              result.operation === "RECOVERY"
                ? "FILE_RECOVERY"
                : result.operation === "FILE_ERASE"
                  ? "FILE_ERASE"
                  : "DRIVE_WIPE";
            auditService.logOperation({
              timestamp: new Date().toISOString(),
              operation,
              target: `Fleet Node: ${data.nodeId || "Node"} (${node?.hostname || node?.ip || "Remote"})`,
              details: {
                caseId:
                  workspace?.caseId ||
                  `FLEET-${fleetHostInstance?.getRoomKey() || "UNKNOWN"}`,
                caseTitle: workspace?.title || "Fleet Workspace",
                evidenceTag: workspace?.evidenceTag || "FLEET-EVIDENCE",
                authorizingOfficer:
                  workspace?.authorizingOfficer || "Fleet Orchestrator",
                systemHost: node?.hostname || data.nodeId,
                nodeId: data.nodeId,
                ip: node?.ip,
                summary: result.summary,
                status: result.success ? "COMPLETED" : "FAILED",
                operation: result.operation,
                standard:
                  (result as any).standard ||
                  workspace?.selectedOptions?.wipeStandard ||
                  "nist-clear",
                fleetCluster: true,
              },
              status: result.success ? "VERIFIED" : "FAILED",
              operator: workspace?.authorizingOfficer || "FLEET_ORCHESTRATOR",
              hash_before: (result as any).preHash || null,
              hash_after: (result as any).postHash || null,
              verification_result: (result as any).verification || {
                verified: result.success,
                durationMs: result.durationMs,
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
  ipcMain.handle(
    "fleet:broadcast-prescan",
    async (
      _,
      nodeIds?: string[],
      targetPathByNode?: Record<string, string>,
    ) => {
      if (fleetHostInstance) {
        const dispatched = fleetHostInstance.broadcastPreScan(
          nodeIds,
          targetPathByNode,
        );
        return {
          success: dispatched > 0,
          dispatched,
          error:
            dispatched > 0
              ? undefined
              : "No selected fleet nodes are connected.",
        };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  // 4. Broadcast Wipe
  ipcMain.handle(
    "fleet:broadcast-wipe",
    async (
      _,
      standard: string,
      nodeIds?: string[],
      targetPathByNode?: Record<string, string>,
    ) => {
      if (fleetHostInstance) {
        const dispatched = fleetHostInstance.broadcastWipe(
          standard,
          nodeIds,
          targetPathByNode,
        );
        return {
          success: dispatched > 0,
          dispatched,
          error:
            dispatched > 0
              ? undefined
              : "No selected fleet nodes are connected.",
        };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  // 5. Broadcast Recovery
  ipcMain.handle(
    "fleet:broadcast-recovery",
    async (
      _,
      fileTypes: string[],
      nodeIds?: string[],
      sourcePathByNode?: Record<string, string>,
      outputDirByNode?: Record<string, string>,
    ) => {
      if (fleetHostInstance) {
        const dispatched = fleetHostInstance.broadcastRecovery(
          fileTypes,
          nodeIds,
          sourcePathByNode,
          outputDirByNode,
        );
        return {
          success: dispatched > 0,
          dispatched,
          error:
            dispatched > 0
              ? undefined
              : "No selected fleet nodes are connected.",
        };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  // 6. Broadcast targeted file erasure
  ipcMain.handle(
    "fleet:broadcast-file-erase",
    async (
      _,
      paths: string[],
      standard: string,
      cleanMetadata: boolean,
      nodeIds?: string[],
    ) => {
      if (fleetHostInstance) {
        const dispatched = fleetHostInstance.broadcastFileErase(
          paths,
          standard,
          cleanMetadata,
          nodeIds,
        );
        return {
          success: dispatched > 0,
          dispatched,
          error:
            dispatched > 0
              ? undefined
              : "No selected fleet nodes are connected.",
        };
      }
      return { success: false, error: "Fleet host not running" };
    },
  );

  ipcMain.handle(
    "fleet:save-recovered-files",
    async (
      _,
      destinationDir: string,
      files: Array<{ name?: string; outputPath?: string; dataBase64?: string }>,
    ) => {
      if (!destinationDir || !Array.isArray(files)) {
        return {
          success: false,
          error: "A destination directory and recovered files are required.",
        };
      }
      try {
        await fs.mkdir(destinationDir, { recursive: true });
        const savedPaths: string[] = [];
        for (const file of files) {
          if (!file.dataBase64) continue;
          const safeName = path.basename(
            file.name ||
              file.outputPath ||
              `recovered-${savedPaths.length + 1}`,
          );
          const targetPath = path.join(destinationDir, safeName);
          await fs.writeFile(
            targetPath,
            Buffer.from(file.dataBase64, "base64"),
          );
          savedPaths.push(targetPath);
        }
        return { success: true, savedPaths };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Could not save recovered files.",
        };
      }
    },
  );

  // 7. Close Lobby
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
