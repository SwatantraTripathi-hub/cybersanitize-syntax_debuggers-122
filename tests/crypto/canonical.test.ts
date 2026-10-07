import { describe, expect, it } from 'vitest';
import {
  canonicalizeBytes,
  canonicalizeJson
} from '../../src/main/crypto/canonical';

describe('canonicalizeJson', () => {
  it('sorts object keys recursively so insertion order cannot change a hash', () => {
    const a = { b: 1, a: { z: true, y: [3, { q: 1, p: 2 }] } };
    const b = { a: { y: [3, { p: 2, q: 1 }], z: true }, b: 1 };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
  });

  it('produces byte-identical output for identical logical values', () => {
    const first = canonicalizeJson({ operation: 'DRIVE_WIPE', details: { passes: 3 } });
    const second = canonicalizeJson({ details: { passes: 3 }, operation: 'DRIVE_WIPE' });
    expect(first).toBe(second);
  });

  it('preserves array order (arrays are ordered data)', () => {
    expect(canonicalizeJson([1, 2])).not.toBe(canonicalizeJson([2, 1]));
  });

  it('rejects undefined values inside objects', () => {
    expect(() => canonicalizeJson({ key: undefined })).toThrow();
  });

  it('rejects NaN and Infinity', () => {
    expect(() => canonicalizeJson({ n: NaN })).toThrow();
    expect(() => canonicalizeJson({ n: Infinity })).toThrow();
  });

  it('rejects bigint values', () => {
    expect(() => canonicalizeJson({ n: BigInt(1) })).toThrow();
  });

  it('rejects circular references instead of hanging', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => canonicalizeJson(obj)).toThrow();
  });

  it('converts Date to ISO-8601 but rejects other non-plain objects', () => {
    expect(canonicalizeJson({ d: new Date(0) })).toContain('"1970-01-01T00:00:00.000Z"');
    expect(() => canonicalizeJson({ m: new Map() })).toThrow();
    expect(() => canonicalizeJson({ b: Buffer.from('x') })).toThrow();
  });

  it('round-trips through JSON.parse', () => {
    const value = { a: 1, b: 'x', c: null, d: [1, 2] };
    expect(JSON.parse(canonicalizeJson(value))).toEqual(value);
  });

  it('canonicalizeBytes returns deterministic utf8 bytes', () => {
    const x = canonicalizeBytes({ k: 'v' });
    const y = canonicalizeBytes({ k: 'v' });
    expect(Buffer.compare(x, y)).toBe(0);
  });
});
