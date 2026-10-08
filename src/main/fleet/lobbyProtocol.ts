/**
 * Fleet Lobby Protocol — Typed message schemas for the multi-device
 * WebSocket orchestration mesh (CyberSanitize Enterprise Fleet Mode).
 *
 * All packets exchanged between FleetHost and FleetClient conform to
 * the FleetPacket<T> envelope.
 */

export enum FleetMessageType {
  // Client → Host
  JOIN_ROOM = 'JOIN_ROOM',
  TELEMETRY = 'TELEMETRY',
  PRE_SCAN_RESULT = 'PRE_SCAN_RESULT',
  JOB_COMPLETE = 'JOB_COMPLETE',
  HEARTBEAT = 'HEARTBEAT',

  // Host → Client
  ROOM_ACCEPTED = 'ROOM_ACCEPTED',
  ROOM_REJECTED = 'ROOM_REJECTED',
  PRE_SCAN_REQ = 'PRE_SCAN_REQ',
  EXEC_WIPE = 'EXEC_WIPE',
  EXEC_RECOVERY = 'EXEC_RECOVERY',
  BROADCAST = 'BROADCAST',
  DISCONNECT = 'DISCONNECT'
}

export interface FleetPacket<T = unknown> {
  type: FleetMessageType
  nodeId: string
  roomKey: string
  timestamp: string
  payload: T
}

export interface JoinRoomPayload {
  nodeId: string
  hostname: string
  ip: string
  mac: string
  model: string
  storage: string
  platform: string
}

export interface TelemetryPayload {
  progress: number
  speed: string
  eta: string
  phase: string
  logLine: string
}

export interface PreScanFindingsPayload {
  filesFound: number
  docs: number
  media: number
  databases: number
  entropy: number
  safeToWipe: boolean
  driveLabel: string
  scannedAt: string
}

export interface ExecuteWipePayload {
  standard: string
  targetPath?: string
}

export interface ExecuteRecoveryPayload {
  fileTypes: string[]
  sourcePath?: string
  outputDir?: string
}

export interface JobCompletePayload {
  success: boolean
  operation: 'WIPE' | 'RECOVERY' | 'PRE_SCAN'
  summary: string
  durationMs: number
}

export interface FleetWorkspaceOptions {
  wipeStandard: string
  recoveryTypes: string[]
  writeBlockerEnforced: boolean
  preScanEnabled: boolean
}

export interface FleetWorkspaceMeta {
  caseId: string
  title: string
  evidenceTag: string
  authorizingOfficer: string
  date: string
  notes: string
  classification: string
  driveSerial?: string
  selectedOptions: FleetWorkspaceOptions
}

export interface RoomAcceptedPayload {
  roomKey: string
  hostVersion: string
  connectedPeers: number
  workspaceMeta?: FleetWorkspaceMeta
}

export interface BroadcastPayload {
  message: string
  severity: 'INFO' | 'WARN' | 'ERROR'
}

/** Represents a node as tracked by the host */
export interface ConnectedNode {
  nodeId: string
  hostname: string
  ip: string
  mac: string
  model: string
  storage: string
  platform: string
  connectedAt: string
  status: 'ONLINE' | 'PRE-SCANNING' | 'SANITIZING' | 'RECOVERING' | 'VERIFIED' | 'IDLE'
  progress: number
  speed: string
  eta: string
  lastLog: string
  preScanFindings?: PreScanFindingsPayload
}

