export type WipeStandardId =
  | 'nist-clear'
  | 'nist-purge'
  | 'cryptographic-erase'
  | 'legacy-multi-pass'
  | 'dry-run'

export type WipeCapabilityStatus = 'AVAILABLE' | 'UNAVAILABLE'

export interface WipeStandard {
  id: WipeStandardId
  name: string
  description: string
  passes: number
  status: WipeCapabilityStatus
  requiresNativeSupport: boolean
}

export const WIPE_STANDARDS: readonly WipeStandard[] = [
  { id: 'nist-clear', name: 'NIST Clear', description: 'Single verified zero-fill pass', passes: 1, status: 'AVAILABLE', requiresNativeSupport: false },
  { id: 'nist-purge', name: 'NIST Purge', description: 'Device-specific purge; unavailable without native support', passes: 1, status: 'UNAVAILABLE', requiresNativeSupport: true },
  { id: 'cryptographic-erase', name: 'Cryptographic Erase', description: 'Controller key destruction; unavailable without native support', passes: 1, status: 'UNAVAILABLE', requiresNativeSupport: true },
  { id: 'legacy-multi-pass', name: 'Legacy Multi-pass', description: 'Three deterministic overwrite passes', passes: 3, status: 'AVAILABLE', requiresNativeSupport: false },
  { id: 'dry-run', name: 'Dry Run', description: 'Reports work without writing', passes: 0, status: 'AVAILABLE', requiresNativeSupport: false }
]

export function getWipeStandard(id: WipeStandardId): WipeStandard {
  const standard = WIPE_STANDARDS.find((candidate) => candidate.id === id)
  if (!standard) throw new Error(`Unsupported wipe standard: ${id}`)
  return standard
}
