/**
 * Operator registry repository — the authoritative source for permission
 * checks (consumed by PermissionGuard via OperatorRegistryLike).
 *
 * Renderer-supplied claims never reach this table: registration requires a
 * validated operator id, an explicit permission level and the id of the
 * registering operator.
 */

import { PermissionLevel } from '../../types/security';
import { OperatorRecord } from '../../types/evidence';
import { SecurityError } from '../../types/errors';
import { assertOperatorId, assertPermissionLevel, assertSafeText, assertTimestamp } from '../../security/inputGuard';
import type { Driver } from '../driver';
import type { OperatorRegistryLike } from '../../security/permissionGuard';

interface OperatorRow {
  operator_id: string;
  permission_level: string;
  display_name: string;
  registered_at: string;
  registered_by: string;
}

function rowToOperator(row: OperatorRow): OperatorRecord {
  return {
    operatorId: row.operator_id,
    permissionLevel: row.permission_level as PermissionLevel,
    displayName: row.display_name,
    registeredAt: row.registered_at,
    registeredBy: row.registered_by
  };
}

export interface RegisterOperatorInput {
  operatorId: string;
  permissionLevel: PermissionLevel;
  displayName?: string;
  registeredAt?: string;
  registeredBy: string;
}

const SELECT_COLUMNS = 'operator_id, permission_level, display_name, registered_at, registered_by';

export class OperatorRepository implements OperatorRegistryLike {
  constructor(private readonly driver: Driver) {}

  register(input: RegisterOperatorInput): OperatorRecord {
    const operatorId = assertOperatorId(input.operatorId);
    const permissionLevel = assertPermissionLevel(input.permissionLevel);
    const displayName = assertSafeText(input.displayName ?? operatorId, 'display name', 256);
    const registeredAt =
      input.registeredAt === undefined
        ? new Date().toISOString()
        : assertTimestamp(input.registeredAt, 'registered_at');
    const registeredBy = assertOperatorId(input.registeredBy);

    return this.driver.transaction(() => {
      const existing = this.driver.get<{ operator_id: string }>(
        'SELECT operator_id FROM operators WHERE operator_id = ?',
        operatorId
      );
      if (existing) {
        throw new SecurityError('CONSTRAINT_VIOLATION', `operator ${operatorId} is already registered`);
      }
      this.driver.run(
        'INSERT INTO operators (operator_id, permission_level, display_name, registered_at, registered_by) VALUES (?, ?, ?, ?, ?)',
        operatorId,
        permissionLevel,
        displayName,
        registeredAt,
        registeredBy
      );
      return this.requireById(operatorId);
    });
  }

  /** PermissionGuard hook: unknown operators return null (fail closed). */
  getLevel(operatorId: string): PermissionLevel | null {
    const row = this.driver.get<{ permission_level: string }>(
      'SELECT permission_level FROM operators WHERE operator_id = ?',
      operatorId
    );
    if (!row) return null;
    const level = row.permission_level;
    return level === 'READ_ONLY' || level === 'OPERATOR' || level === 'FULL' ? level : null;
  }

  getById(operatorId: string): OperatorRecord | null {
    const id = assertOperatorId(operatorId);
    const row = this.driver.get<OperatorRow>(
      `SELECT ${SELECT_COLUMNS} FROM operators WHERE operator_id = ?`,
      id
    );
    return row ? rowToOperator(row) : null;
  }

  requireById(operatorId: string): OperatorRecord {
    const found = this.getById(operatorId);
    if (!found) {
      throw new SecurityError('NOT_FOUND', `operator ${operatorId} is not registered`);
    }
    return found;
  }

  list(): OperatorRecord[] {
    const rows = this.driver.all<OperatorRow>(
      `SELECT ${SELECT_COLUMNS} FROM operators ORDER BY registered_at ASC`
    );
    return rows.map(rowToOperator);
  }

  /**
   * Changes an existing operator's level. Deliberately separate from
   * register(): escalation requires an explicit call, never a re-register.
   */
  setLevel(operatorId: string, permissionLevel: PermissionLevel): OperatorRecord {
    const id = assertOperatorId(operatorId);
    const level = assertPermissionLevel(permissionLevel);
    return this.driver.transaction(() => {
      const result = this.driver.run(
        'UPDATE operators SET permission_level = ? WHERE operator_id = ?',
        level,
        id
      );
      if (result.changes === 0) {
        throw new SecurityError('NOT_FOUND', `operator ${id} is not registered`);
      }
      return this.requireById(id);
    });
  }

  remove(operatorId: string): boolean {
    const id = assertOperatorId(operatorId);
    const result = this.driver.run('DELETE FROM operators WHERE operator_id = ?', id);
    return result.changes > 0;
  }
}
