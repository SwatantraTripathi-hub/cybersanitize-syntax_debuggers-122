import { contextBridge, ipcRenderer } from 'electron'

// Store listener references for cleanup
let wipeProgressListener: ((_event: any, progress: any) => void) | null = null
let fileEraseProgressListener: ((_event: any, progress: any) => void) | null = null
let carvingProgressListener: ((_event: any, progress: any) => void) | null = null

const api = {
  // Drive operations
  detectDrives: () => ipcRenderer.invoke('drive:detect'),
  getDriveInfo: (driveNumber: number) => ipcRenderer.invoke('drive:get-info', driveNumber),

  // Wipe operations
  startWipe: (config: any) => ipcRenderer.invoke('wipe:start', config.targetPath, config.standard, {
    dryRun: config.dryRun,
    blockSize: config.blockSize || 4096,
    verify: config.verify,
    size: config.size,
    caseMeta: config.caseMeta
  }),
  getWipeStandards: () => ipcRenderer.invoke('wipe:get-standards'),
  onWipeProgress: (callback: (progress: any) => void) => {
    wipeProgressListener = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('wipe:progress', wipeProgressListener)
  },
  removeWipeProgressListener: () => {
    if (wipeProgressListener) {
      ipcRenderer.removeListener('wipe:progress', wipeProgressListener)
      wipeProgressListener = null
    }
  },
  getEntropySnapshot: (targetPath: string) => ipcRenderer.invoke('wipe:entropy-snapshot', targetPath),

  // File erase operations
  selectFiles: () => ipcRenderer.invoke('file-erase:files'),
  selectFolder: () => ipcRenderer.invoke('file-erase:folder'),
  startFileErase: (config: any) => ipcRenderer.invoke('file-erase:start', config.paths, config.standard, config.caseMeta),
  onFileEraseProgress: (callback: (progress: any) => void) => {
    fileEraseProgressListener = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('file-erase:progress', fileEraseProgressListener)
  },
  removeFileEraseProgressListener: () => {
    if (fileEraseProgressListener) {
      ipcRenderer.removeListener('file-erase:progress', fileEraseProgressListener)
      fileEraseProgressListener = null
    }
  },

  // Carving/Recovery operations
  selectSource: () => ipcRenderer.invoke('carve:select-source'),
  startCarving: (config: any) => ipcRenderer.invoke('carve:start', config.sourcePath, config.outputDir, config.fileTypes, config.size, config.caseMeta),
  getSignatures: () => ipcRenderer.invoke('carve:get-signatures'),
  detectAntiForensics: (imagePath: string) => ipcRenderer.invoke('carve:detect-anti-forensics', imagePath),
  onCarvingProgress: (callback: (progress: any) => void) => {
    carvingProgressListener = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('carve:progress', carvingProgressListener)
  },
  removeCarvingProgressListener: () => {
    if (carvingProgressListener) {
      ipcRenderer.removeListener('carve:progress', carvingProgressListener)
      carvingProgressListener = null
    }
  },

  // Evidence Write-Blocker Subsystem (ISO/IEC 27037)
  verifyWriteBlocker: (drivePath: string, caseMeta?: any) => ipcRenderer.invoke('writeblocker:verify', drivePath, caseMeta),
  getWriteBlockerStatus: (drivePath?: string) => ipcRenderer.invoke('writeblocker:get-status', drivePath),
  protectDrive: (drivePath: string) => ipcRenderer.invoke('writeblocker:protect', drivePath),
  unprotectDrive: (drivePath: string) => ipcRenderer.invoke('writeblocker:unprotect', drivePath),
  getProtectedDrives: () => ipcRenderer.invoke('writeblocker:get-protected-drives'),
  setSystemWriteProtectPolicy: (enable: boolean) => ipcRenderer.invoke('writeblocker:set-system-policy', enable),
  setDiskReadOnlyAttribute: (diskNumber: number, enable: boolean) => ipcRenderer.invoke('writeblocker:set-disk-readonly', diskNumber, enable),

  // Audit log
  getAuditLogs: (filter?: any) => ipcRenderer.invoke('audit:get-logs', filter?.limit || 50, filter?.offset || 0, filter),
  getAuditStats: (caseId?: string) => ipcRenderer.invoke('audit:get-stats', caseId),
  clearAuditLogs: () => ipcRenderer.invoke('audit:clear-logs'),
  exportAuditCSV: () => ipcRenderer.invoke('audit:export-csv'),
  verifyAuditChain: () => ipcRenderer.invoke('audit:verify-chain'),
  repairAuditChain: () => ipcRenderer.invoke('audit:repair-chain'),
  exportForensicBundle: (caseId?: string) => ipcRenderer.invoke('audit:export-bundle', caseId),
  importVerifyBundle: (bundlePath?: string) => ipcRenderer.invoke('audit:import-verify-bundle', bundlePath),
  getAuditPublicKey: () => ipcRenderer.invoke('audit:get-public-key'),

  // Reports
  generateReport: (operationId: number) => ipcRenderer.invoke('report:generate', operationId),
  verifyReport: (pdfPath: string, sigPath: string) => ipcRenderer.invoke('report:verify', pdfPath, sigPath),
  verifyReportFile: (pdfPath?: string) => ipcRenderer.invoke('report:verify-file', pdfPath),
  openReport: (filePath: string) => ipcRenderer.invoke('report:open', filePath),
  showReportInFolder: (filePath: string) => ipcRenderer.invoke('report:show-in-folder', filePath),
  listReports: (caseId?: string) => ipcRenderer.invoke('report:list', caseId),
  clearReports: () => ipcRenderer.invoke('report:clear-all'),
  verifyAirGapPayload: (payload: string) => ipcRenderer.invoke('report:verify-airgap-payload', payload),
  getQrDataUrl: (text: string, options?: any) => ipcRenderer.invoke('report:get-qr-data-url', text, options),

  // Utility
  createTestImage: (sizeMB: number) => ipcRenderer.invoke('wipe:create-test-image', sizeMB),
  getAppVersion: () => ipcRenderer.invoke('app:get-version')
}

// Expose the API to the renderer process
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose API via contextBridge:', error)
}

export type ElectronAPI = typeof api
