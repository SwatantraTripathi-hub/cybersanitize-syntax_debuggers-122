import { contextBridge, ipcRenderer } from "electron";

// Store listener references for cleanup
let wipeProgressListener: ((_event: any, progress: any) => void) | null = null;
let fileEraseProgressListener: ((_event: any, progress: any) => void) | null =
  null;
let carvingProgressListener: ((_event: any, progress: any) => void) | null =
  null;

const api = {
  // Drive operations
  detectDrives: (forceRefresh?: boolean) =>
    ipcRenderer.invoke("drive:detect", forceRefresh),
  getDriveInfo: (driveNumber: number) =>
    ipcRenderer.invoke("drive:get-info", driveNumber),

  // Wipe operations
  startWipe: (config: any) =>
    ipcRenderer.invoke("wipe:start", config.targetPath, config.standard, {
      dryRun: config.dryRun,
      blockSize: config.blockSize || 4096,
      verify: config.verify,
      size: config.size,
      caseMeta: config.caseMeta,
    }),
  getWipeStandards: () => ipcRenderer.invoke("wipe:get-standards"),
  onWipeProgress: (callback: (progress: any) => void) => {
    wipeProgressListener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on("wipe:progress", wipeProgressListener);
  },
  removeWipeProgressListener: () => {
    if (wipeProgressListener) {
      ipcRenderer.removeListener("wipe:progress", wipeProgressListener);
      wipeProgressListener = null;
    }
  },
  getEntropySnapshot: (targetPath: string) =>
    ipcRenderer.invoke("wipe:entropy-snapshot", targetPath),

  // File erase operations
  selectFiles: () => ipcRenderer.invoke("file-erase:files"),
  selectFolder: () => ipcRenderer.invoke("file-erase:folder"),
  startFileErase: (config: any) =>
    ipcRenderer.invoke(
      "file-erase:start",
      config.paths,
      config.standard,
      config.caseMeta,
    ),
  onFileEraseProgress: (callback: (progress: any) => void) => {
    fileEraseProgressListener = (_event: any, progress: any) =>
      callback(progress);
    ipcRenderer.on("file-erase:progress", fileEraseProgressListener);
  },
  removeFileEraseProgressListener: () => {
    if (fileEraseProgressListener) {
      ipcRenderer.removeListener(
        "file-erase:progress",
        fileEraseProgressListener,
      );
      fileEraseProgressListener = null;
    }
  },

  // Carving/Recovery operations
  selectSource: () => ipcRenderer.invoke("carve:select-source"),
  startCarving: (config: any) =>
    ipcRenderer.invoke(
      "carve:start",
      config.sourcePath,
      config.outputDir,
      config.fileTypes,
      config.size,
      config.caseMeta,
    ),
  getSignatures: () => ipcRenderer.invoke("carve:get-signatures"),
  detectAntiForensics: (imagePath: string) =>
    ipcRenderer.invoke("carve:detect-anti-forensics", imagePath),
  onCarvingProgress: (callback: (progress: any) => void) => {
    carvingProgressListener = (_event: any, progress: any) =>
      callback(progress);
    ipcRenderer.on("carve:progress", carvingProgressListener);
  },
  removeCarvingProgressListener: () => {
    if (carvingProgressListener) {
      ipcRenderer.removeListener("carve:progress", carvingProgressListener);
      carvingProgressListener = null;
    }
  },

  // Evidence Write-Blocker Subsystem (ISO/IEC 27037)
  verifyWriteBlocker: (drivePath: string, caseMeta?: any) =>
    ipcRenderer.invoke("writeblocker:verify", drivePath, caseMeta),
  getWriteBlockerStatus: (drivePath?: string) =>
    ipcRenderer.invoke("writeblocker:get-status", drivePath),
  protectDrive: (drivePath: string) =>
    ipcRenderer.invoke("writeblocker:protect", drivePath),
  unprotectDrive: (drivePath: string) =>
    ipcRenderer.invoke("writeblocker:unprotect", drivePath),
  getProtectedDrives: () =>
    ipcRenderer.invoke("writeblocker:get-protected-drives"),
  setSystemWriteProtectPolicy: (enable: boolean) =>
    ipcRenderer.invoke("writeblocker:set-system-policy", enable),
  setDiskReadOnlyAttribute: (diskNumber: number, enable: boolean) =>
    ipcRenderer.invoke("writeblocker:set-disk-readonly", diskNumber, enable),

  // Audit log
  getAuditLogs: (filter?: any) =>
    ipcRenderer.invoke(
      "audit:get-logs",
      filter?.limit || 50,
      filter?.offset || 0,
      filter,
    ),
  getAuditStats: (caseId?: string) =>
    ipcRenderer.invoke("audit:get-stats", caseId),
  clearAuditLogs: () => ipcRenderer.invoke("audit:clear-logs"),
  exportAuditCSV: (caseId?: string) =>
    ipcRenderer.invoke("audit:export-csv", caseId),
  exportAuditChain: (caseId?: string) =>
    ipcRenderer.invoke("audit:export-chain", caseId),
  verifyAuditChainFile: (chainPath?: string) =>
    ipcRenderer.invoke("audit:verify-chain-file", chainPath),
  verifyAuditChain: () => ipcRenderer.invoke("audit:verify-chain"),
  repairAuditChain: () => ipcRenderer.invoke("audit:repair-chain"),
  exportForensicBundle: (caseId?: string) =>
    ipcRenderer.invoke("audit:export-bundle", caseId),
  importVerifyBundle: (bundlePath?: string) =>
    ipcRenderer.invoke("audit:import-verify-bundle", bundlePath),
  getAuditPublicKey: () => ipcRenderer.invoke("audit:get-public-key"),

  // Reports
  generateReport: (operationId: number) =>
    ipcRenderer.invoke("report:generate", operationId),
  generateFleetReport: (payload: any) =>
    ipcRenderer.invoke("report:generate-fleet", payload),
  verifyReport: (pdfPath: string, sigPath: string) =>
    ipcRenderer.invoke("report:verify", pdfPath, sigPath),
  verifyReportFile: (pdfPath?: string) =>
    ipcRenderer.invoke("report:verify-file", pdfPath),
  openReport: (filePath: string) => ipcRenderer.invoke("report:open", filePath),
  showReportInFolder: (filePath: string) =>
    ipcRenderer.invoke("report:show-in-folder", filePath),
  listReports: (caseId?: string) => ipcRenderer.invoke("report:list", caseId),
  clearReports: () => ipcRenderer.invoke("report:clear-all"),
  verifyAirGapPayload: (payload: string) =>
    ipcRenderer.invoke("report:verify-airgap-payload", payload),
  getQrDataUrl: (text: string, options?: any) =>
    ipcRenderer.invoke("report:get-qr-data-url", text, options),

  // Utility
  createTestImage: (sizeMB: number) =>
    ipcRenderer.invoke("wipe:create-test-image", sizeMB),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),

  // Fleet Orchestration
  createLobby: (port?: number) =>
    ipcRenderer.invoke("fleet:create-lobby", port),
  setFleetWorkspaceMeta: (meta: any) =>
    ipcRenderer.invoke("fleet:set-workspace-meta", meta),
  joinLobby: (params: { roomCode: string; nodeId: string }) =>
    ipcRenderer.invoke("fleet:join-lobby", params),
  broadcastPreScan: (
    nodeIds?: string[],
    targetPathByNode?: Record<string, string>,
  ) => ipcRenderer.invoke("fleet:broadcast-prescan", nodeIds, targetPathByNode),
  broadcastWipe: (
    standard: string,
    nodeIds?: string[],
    targetPathByNode?: Record<string, string>,
  ) =>
    ipcRenderer.invoke(
      "fleet:broadcast-wipe",
      standard,
      nodeIds,
      targetPathByNode,
    ),
  broadcastRecovery: (
    fileTypes: string[],
    nodeIds?: string[],
    sourcePathByNode?: Record<string, string>,
  ) =>
    ipcRenderer.invoke(
      "fleet:broadcast-recovery",
      fileTypes,
      nodeIds,
      sourcePathByNode,
    ),
  closeLobby: () => ipcRenderer.invoke("fleet:close-lobby"),
  leaveFleetWorkspace: () => ipcRenderer.invoke("fleet:leave-client"),
  getFleetNodes: () => ipcRenderer.invoke("fleet:get-nodes"),
  getFleetStatus: () => ipcRenderer.invoke("fleet:get-status"),
  onFleetNodeJoined: (callback: (node: any) => void) => {
    const listener = (_event: any, node: any) => callback(node);
    ipcRenderer.on("fleet:node-joined", listener);
    return () => ipcRenderer.removeListener("fleet:node-joined", listener);
  },
  onFleetNodePreScan: (callback: (node: any) => void) => {
    const listener = (_event: any, node: any) => callback(node);
    ipcRenderer.on("fleet:node-prescan", listener);
    return () => ipcRenderer.removeListener("fleet:node-prescan", listener);
  },
  onFleetTelemetry: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("fleet:telemetry", listener);
    return () => ipcRenderer.removeListener("fleet:telemetry", listener);
  },
  onFleetNodeComplete: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("fleet:node-complete", listener);
    return () => ipcRenderer.removeListener("fleet:node-complete", listener);
  },
  onFleetNodeDisconnected: (callback: (nodeId: string) => void) => {
    const listener = (_event: any, nodeId: string) => callback(nodeId);
    ipcRenderer.on("fleet:node-disconnected", listener);
    return () =>
      ipcRenderer.removeListener("fleet:node-disconnected", listener);
  },
  onFleetClientCommand: (callback: (type: string) => void) => {
    const listener = (_event: any, type: string) => callback(type);
    ipcRenderer.on("fleet:client-command", listener);
    return () => ipcRenderer.removeListener("fleet:client-command", listener);
  },
  onFleetClientDisconnected: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("fleet:client-disconnected", listener);
    return () =>
      ipcRenderer.removeListener("fleet:client-disconnected", listener);
  },
};

// Expose the API to the renderer process
try {
  contextBridge.exposeInMainWorld("api", api);
} catch (error) {
  console.error("Failed to expose API via contextBridge:", error);
}

export type ElectronAPI = typeof api;
