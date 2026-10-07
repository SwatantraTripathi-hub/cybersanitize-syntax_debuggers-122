import fs from 'node:fs'
import path from 'node:path'

export type WipeTargetKind =
  | 'REGULAR_FILE'
  | 'DISK_IMAGE'
  | 'VOLUME'
  | 'PARTITION'
  | 'PHYSICAL_DRIVE'
  | 'UNSUPPORTED'

export interface WipeTarget {
  input: string
  resolvedPath: string
  kind: WipeTargetKind
  size?: number
  isSystemTarget: boolean
}

export class WipeTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WipeTargetError'
  }
}

const physicalDrivePattern = /^\\\\\.\\PhysicalDrive([0-9]+)$/i
const volumePattern = /^\\\\\.\\([A-Za-z]):\\?$/
const driveLetterPattern = /^[A-Za-z]:\\?$/
const partitionPattern = /^\\\\\.\\Harddisk([0-9]+)Partition([0-9]+)$/i

function systemVolume(): string | null {
  if (process.platform !== 'win32') return null
  const systemRoot = process.env.SystemRoot
  if (!systemRoot) return null
  return path.parse(path.resolve(systemRoot)).root.toUpperCase()
}

function assertNotSystemVolume(target: string, kind: WipeTargetKind): void {
  if (process.platform !== 'win32') return
  const root = systemVolume()
  if (!root) return
  const letter = target.match(driveLetterPattern)?.[0]?.slice(0, 1).toUpperCase()
  const volume = target.match(volumePattern)?.[1]?.toUpperCase()
  if ((letter || volume) && `${letter || volume}:\\` === root) {
    throw new WipeTargetError('Refusing to operate on the Windows system volume')
  }
  if (!letter && !volume && path.parse(path.resolve(target)).root.toUpperCase() === root) {
    throw new WipeTargetError('Refusing to operate on the Windows system volume')
  }
  if (kind === 'PHYSICAL_DRIVE') {
    throw new WipeTargetError('Physical drive protection requires native disk topology validation')
  }
}

export function classifyWipeTarget(input: string): WipeTargetKind {
  if (typeof input !== 'string' || input.trim() === '') return 'UNSUPPORTED'
  const value = input.trim()
  if (physicalDrivePattern.test(value)) return 'PHYSICAL_DRIVE'
  if (partitionPattern.test(value)) return 'PARTITION'
  if (volumePattern.test(value) || driveLetterPattern.test(value)) return 'VOLUME'
  if (path.extname(value).toLowerCase() === '.dd' || /\.(raw|img)$/i.test(value)) {
    return 'DISK_IMAGE'
  }
  return 'REGULAR_FILE'
}

export function resolveWipeTarget(input: string): WipeTarget {
  const kind = classifyWipeTarget(input)
  if (kind === 'UNSUPPORTED') throw new WipeTargetError('Target is missing')
  const value = input.trim()
  if (kind === 'PHYSICAL_DRIVE' || kind === 'PARTITION') {
    assertNotSystemVolume(value, kind)
    throw new WipeTargetError(`${kind} targets require native Windows disk validation`)
  }
  if (kind === 'VOLUME') {
    assertNotSystemVolume(value, kind)
    const letter = value.match(volumePattern)?.[1] || value.slice(0, 1)
    const resolvedPath = `${letter.toUpperCase()}:\\`
    if (!fs.existsSync(resolvedPath)) throw new WipeTargetError(`Volume does not exist: ${resolvedPath}`)
    return { input, resolvedPath, kind, isSystemTarget: false }
  }
  const resolvedPath = path.resolve(value)
  let stats: fs.Stats
  try {
    stats = fs.lstatSync(resolvedPath)
  } catch {
    throw new WipeTargetError(`Target does not exist: ${input}`)
  }
  if (!stats.isFile()) throw new WipeTargetError('Only regular files and explicitly validated volumes are supported')
  return { input, resolvedPath, kind, size: stats.size, isSystemTarget: false }
}

export function isLikelySystemDisk(target: WipeTarget): boolean {
  if (process.platform !== 'win32') return false
  const root = systemVolume()
  if (!root) return false
  return target.resolvedPath.toUpperCase().startsWith(root) || target.kind === 'PHYSICAL_DRIVE'
}
