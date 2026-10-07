/**
 * Shared error model for the CyberSanitize backend.
 *
 * Every backend layer (crypto, security, persistence) throws subclasses of
 * CyberSanitizeError with an explicit machine-readable code so that IPC
 * handlers can map failures to honest operation outcomes instead of generic
 * `success: false` booleans.
 */

export type ErrorCode =
  // Input validation (untrusted renderer input)
  | 'INPUT_INVALID'
  | 'INPUT_TOO_LARGE'
  | 'INPUT_UNSUPPORTED'
  // Cryptography
  | 'HASH_FORMAT_INVALID'
  | 'SIGNATURE_FORMAT_INVALID'
  | 'CANONICALIZATION_FAILED'
  | 'KEY_UNAVAILABLE'
  | 'KEY_CORRUPT'
  | 'CHAIN_INVALID'
  // Target authorization
  | 'TARGET_MISSING'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_UNSUPPORTED'
  | 'TARGET_SYSTEM_PROTECTED'
  | 'TARGET_PROTECTION_UNVERIFIABLE'
  // Authorization
  | 'PERMISSION_DENIED'
  | 'UNKNOWN_OPERATOR'
  | 'CASE_SCOPE_DENIED'
  // Persistence
  | 'PERSISTENCE_UNAVAILABLE'
  | 'PERSISTENCE_INTEGRITY'
  | 'PERSISTENCE_BUSY'
  | 'CONSTRAINT_VIOLATION'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'NOT_FOUND';

export class CyberSanitizeError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }

  toJSON(): { name: string; code: ErrorCode; message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}

/** Input/authorization failures. Fail closed: never continue after a throw. */
export class SecurityError extends CyberSanitizeError {}

/** Database/integrity failures. The app must not claim durability it cannot prove. */
export class PersistenceError extends CyberSanitizeError {}
