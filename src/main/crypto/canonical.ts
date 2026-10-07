/**
 * Deterministic canonicalization.
 *
 * The exact bytes that are hashed or signed MUST be reproducible from the
 * logical value alone. `JSON.stringify` does not guarantee that: property
 * order follows insertion order, and several JSON-unsafe values are silently
 * dropped or coerced. This module defines an explicit canonical form:
 *
 *  - object keys are sorted by UTF-16 code unit (`.sort()` default)
 *  - `Date` values become their ISO-8601 string
 *  - non-finite numbers, BigInt, undefined, functions and symbols REJECT
 *  - non-plain objects (class instances, Map, Buffer, ...) REJECT
 *  - circular references REJECT
 *  - `-0` normalizes to `0`
 *
 * The same logical record therefore always produces the same canonical bytes,
 * the same SHA-256 hash and the same signature verification result.
 */

import { SecurityError } from '../types/errors';

function fail(message: string): never {
  throw new SecurityError('CANONICALIZATION_FAILED', message);
}

function canonicalizeValue(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) fail(`non-finite number cannot be canonicalized: ${String(value)}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      fail('BigInt cannot be canonicalized; convert to a string or number explicitly');
      return '';
    case 'undefined':
      fail('undefined cannot be canonicalized; use null explicitly');
      return '';
    case 'function':
    case 'symbol':
      fail(`${typeof value} cannot be canonicalized`);
      return '';
    default:
      break;
  }

  const obj = value as object;

  if (obj instanceof Date) {
    const time = obj.getTime();
    if (Number.isNaN(time)) fail('invalid Date cannot be canonicalized');
    return JSON.stringify(obj.toISOString());
  }

  if (seen.has(obj)) fail('circular reference cannot be canonicalized');
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (const item of obj) {
        parts.push(canonicalizeValue(item, seen));
      }
      return `[${parts.join(',')}]`;
    }

    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      fail(
        `only plain objects can be canonicalized (received ${
          (obj as { constructor?: { name?: string } }).constructor?.name ?? 'object'
        })`
      );
    }

    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const entry = (obj as Record<string, unknown>)[key];
      if (entry === undefined) {
        fail(`property "${key}" is undefined; use null explicitly`);
      }
      parts.push(`${JSON.stringify(key)}:${canonicalizeValue(entry, seen)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(obj);
  }
}

/** Canonical JSON text for any JSON-compatible value. Throws SecurityError otherwise. */
export function canonicalizeJson(value: unknown): string {
  return canonicalizeValue(value, new WeakSet<object>());
}

/** Canonical UTF-8 bytes ready for hashing/signing. */
export function canonicalizeBytes(value: unknown): Buffer {
  return Buffer.from(canonicalizeJson(value), 'utf8');
}
