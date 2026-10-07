export interface DriveInfo {
  number: number
  friendlyName: string
  busType: string
  mediaType: string
  size: number
  sizeFormatted: string
  isRemovable: boolean
  isBoot: boolean
  operationalStatus: string
  partitionStyle: string
}

export type WipeStandardType = 'nist-zero' | 'nist-random' | 'dod-3' | 'dod-7'

export interface WipeStandard {
  id: WipeStandardType
  name: string
  description: string
  passes: number
  patterns: string[]
}

export interface WipeConfig {
  targetPath: string
  standard: WipeStandardType
  dryRun: boolean
  verify: boolean
  driveNumber?: number
}

export interface WipeProgress {
  percent: number
  currentPass: number
  totalPasses: number
  bytesWritten: number
  totalBytes: number
  speed: number
  phase: 'writing' | 'verifying' | 'complete'
  currentPattern: string
}

export interface PassResult {
  passNumber: number
  pattern: string
  bytesWritten: number
  durationMs: number
}

export interface VerificationResult {
  passed: boolean
  totalBlocks: number
  sampledBlocks: number
  failedBlocks: number[]
  averageEntropy: number
  expectedEntropy: string
}

export interface WipeResult {
  success: boolean
  standard: string
  passes: PassResult[]
  verification: VerificationResult | null
  startTime: string
  endTime: string
  totalBytes: number
  durationMs: number
  targetPath: string
}

export interface FileEraseConfig {
  paths: string[]
  standard: WipeStandardType
  cleanMetadata: boolean
}

export interface FileEraseResult {
  success: boolean
  filesProcessed: number
  totalBytes: number
  metadataCleaned: string[]
  errors: string[]
}

export interface FileSignatureInfo {
  name: string
  extensions: string[]
  headerHex: string
  hasFooter: boolean
}

export interface CarvingConfig {
  sourcePath: string
  outputDir: string
  fileTypes: string[]
}

export interface CarvedFile {
  name?: string
  category?: 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases' | string
  type: string
  extension: string
  offset: number
  size: number
  confidence: number
  outputPath: string
  sha256: string
  fileStatus?: 'DELETED_RECOVERED' | 'ALREADY_PRESENT'
  isVerified?: boolean
  integrityStatus?: 'VERIFIED_GENUINE' | 'PARTIAL_ARTIFACT' | 'REJECTED_NOISE'
  verificationDetails?: string
  previewText?: string
  thumbnailBase64?: string
}

export interface CarvingResult {
  filesFound: CarvedFile[]
  totalBytesScanned: number
  durationMs: number
}

export interface CarvingProgress {
  percent: number
  bytesScanned: number
  totalBytes: number
  filesFound: number
}

export interface AuditEntry {
  id: number
  timestamp: string
  operation: 'DRIVE_WIPE' | 'FILE_ERASE' | 'FILE_RECOVERY'
  target: string
  details: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VERIFIED'
  operator: string
  hash_before: string | null
  hash_after: string | null
  verification_result: string | null
}

export interface AuditFilter {
  operation?: string
  status?: string
  limit?: number
  offset?: number
}

export interface AuditStats {
  totalOperations: number
  completedWipes: number
  completedRecoveries: number
  completedFileErases: number
  totalBytesWiped: number
  totalFilesRecovered: number
}

export interface AirGapVerificationResult {
  isValid: boolean
  signatureValid: boolean
  digestValid: boolean
  certRef: string
  caseId: string
  tagId: string
  title: string
  target: string
  status: string
  standard: string
  examiner: string
  timestamp: string
  preHash: string
  postHash: string
  certDigest: string
  calculatedDigest: string
  publicKey: string
  signature: string
  localNodeUrl?: string
  errors: string[]
}

