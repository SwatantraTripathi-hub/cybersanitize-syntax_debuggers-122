/**
 * Explicit operation outcome types.
 *
 * The backend must never collapse distinct outcomes into `success: boolean`.
 * A dry run is not a success. An unavailable hardware capability is not a
 * failure of execution. A partial wipe is not a full wipe.
 */

export type OperationStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PARTIAL'
  | 'CANCELLED'
  | 'DRY_RUN'
  | 'UNAVAILABLE';

export interface OperationError {
  code: string;
  message: string;
}

export interface OperationTiming {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export type OperationOutcome<TData = unknown, TPlan = unknown> =
  | ({ status: 'SUCCESS' } & OperationTiming & { data: TData; warnings?: string[] })
  | ({ status: 'FAILED' } & OperationTiming & { errors: OperationError[] })
  | ({ status: 'PARTIAL' } & OperationTiming & { data: TData | null; errors: OperationError[] })
  | ({ status: 'CANCELLED' } & OperationTiming & { completedUnits: number; note?: string })
  | ({ status: 'DRY_RUN' } & OperationTiming & { plan: TPlan; writesPerformed: 0 })
  | ({ status: 'UNAVAILABLE' } & OperationTiming & { capability: string; reason: string });

function timing(startedAtMs: number): OperationTiming {
  const ended = Date.now();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(ended).toISOString(),
    durationMs: Math.max(0, ended - startedAtMs)
  };
}

export function successOutcome<T>(data: T, startedAtMs = Date.now(), warnings?: string[]): OperationOutcome<T, never> {
  return warnings && warnings.length > 0
    ? { status: 'SUCCESS', ...timing(startedAtMs), data, warnings }
    : { status: 'SUCCESS', ...timing(startedAtMs), data };
}

export function failedOutcome(errors: OperationError[], startedAtMs = Date.now()): OperationOutcome<never, never> {
  return { status: 'FAILED', ...timing(startedAtMs), errors };
}

export function partialOutcome<T>(data: T | null, errors: OperationError[], startedAtMs = Date.now()): OperationOutcome<T, never> {
  return { status: 'PARTIAL', ...timing(startedAtMs), data, errors };
}

export function cancelledOutcome(completedUnits: number, note?: string, startedAtMs = Date.now()): OperationOutcome<never, never> {
  return note === undefined
    ? { status: 'CANCELLED', ...timing(startedAtMs), completedUnits }
    : { status: 'CANCELLED', ...timing(startedAtMs), completedUnits, note };
}

/**
 * Dry run outcome. The `writesPerformed: 0` literal is intentional: the type
 * system makes it impossible to build a DRY_RUN outcome that claims any write.
 */
export function dryRunOutcome<TPlan>(plan: TPlan, startedAtMs = Date.now()): OperationOutcome<never, TPlan> {
  return { status: 'DRY_RUN', ...timing(startedAtMs), plan, writesPerformed: 0 };
}

export function unavailableOutcome(capability: string, reason: string, startedAtMs = Date.now()): OperationOutcome<never, never> {
  return { status: 'UNAVAILABLE', ...timing(startedAtMs), capability, reason };
}
