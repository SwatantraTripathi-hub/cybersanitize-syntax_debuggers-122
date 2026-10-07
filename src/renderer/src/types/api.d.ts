declare global {
  interface Window {
    api?: {
      detectDrives?: (forceRefresh?: boolean) => Promise<any[]>
      getDriveInfo?: (driveNumber: number) => Promise<any>
      startWipe?: (config: any) => Promise<any>
      getWipeStandards?: () => Promise<any[]>
      onWipeProgress?: (callback: (progress: any) => void) => void
      removeWipeProgressListener?: () => void
      selectFiles?: () => Promise<string[]>
      selectFolder?: () => Promise<string>
      startFileErase?: (config: any) => Promise<any>
      onFileEraseProgress?: (callback: (progress: any) => void) => void
      removeFileEraseProgressListener?: () => void
      selectSource?: () => Promise<string>
      startCarving?: (config: any) => Promise<any>
      getSignatures?: () => Promise<any[]>
      onCarvingProgress?: (callback: (progress: any) => void) => void
      removeCarvingProgressListener?: () => void
      verifyWriteBlocker?: (drivePath: string, caseMeta?: any) => Promise<any>
      getWriteBlockerStatus?: (drivePath?: string) => Promise<any>
      protectDrive?: (drivePath: string) => Promise<{ success: boolean; protectedDrives: string[] }>
      unprotectDrive?: (drivePath: string) => Promise<{ success: boolean; protectedDrives: string[] }>
      getProtectedDrives?: () => Promise<string[]>
      setSystemWriteProtectPolicy?: (enable: boolean) => Promise<{ success: boolean; message: string }>
      setDiskReadOnlyAttribute?: (diskNumber: number, enable: boolean) => Promise<{ success: boolean; message: string }>
      getAuditLogs?: (filter?: any) => Promise<any[]>
      getAuditStats?: (caseId?: string) => Promise<any>
      clearAuditLogs?: () => Promise<{ success: boolean }>
      exportAuditCSV?: () => Promise<{ success: boolean; filePath?: string; message?: string }>
      generateReport?: (operationId: number) => Promise<string>
      verifyReport?: (pdfPath: string, sigPath: string) => Promise<{ isValid: boolean; error: string | null }>
      openReport?: (path: string) => Promise<boolean>
      showReportInFolder?: (path: string) => Promise<boolean>
      listReports?: (caseId?: string) => Promise<any[]>
      clearReports?: () => Promise<{ success: boolean; error?: string }>
      createTestImage?: (sizeMB: number) => Promise<string>
      getAppVersion?: () => Promise<string>
      getEntropySnapshot?: (targetPath: string) => Promise<any>
      detectAntiForensics?: (imagePath: string) => Promise<any>
      exportForensicBundle?: (caseId?: string) => Promise<any>
      importVerifyBundle?: (bundlePath?: string) => Promise<any>
      getAuditPublicKey?: () => Promise<string>
      verifyAuditChain?: () => Promise<any>
      repairAuditChain?: () => Promise<any>
      verifyReportFile?: (pdfPath?: string) => Promise<any>
      verifyAirGapPayload?: (payload: string) => Promise<any>
      getQrDataUrl?: (text: string, options?: any) => Promise<string>
    }
  }
}

export {}
