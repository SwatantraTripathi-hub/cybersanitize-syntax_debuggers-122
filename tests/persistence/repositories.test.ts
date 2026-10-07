import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, Database } from '../../src/main/persistence/database'
import {
  CaseRepository,
  CreateCaseInput,
} from '../../src/main/persistence/repositories/caseRepository'
import { EvidenceRepository } from '../../src/main/persistence/repositories/evidenceRepository'
import { OperatorRepository } from '../../src/main/persistence/repositories/operatorRepository'
import { SecurityError } from '../../src/main/types/errors'

let db: Database | null = null

async function setup(): Promise<{
  cases: CaseRepository
  evidence: EvidenceRepository
  operators: OperatorRepository
}> {
  db = await openDatabase({})
  return {
    cases: new CaseRepository(db.driver),
    evidence: new EvidenceRepository(db.driver),
    operators: new OperatorRepository(db.driver),
  }
}

function createTestCase(repository: CaseRepository, input: CreateCaseInput) {
  return repository.create({
    evidenceTag: 'EVD-TEST-01',
    authorizingOfficer: 'Test Examiner',
    date: '2026-10-08',
    notes: 'Test evidence workspace',
    classification: 'TEST',
    ...input,
  })
}

afterEach(() => {
  db?.close()
  db = null
})

describe('CaseRepository', () => {
  it('creates and reads back a case', async () => {
    const { cases } = await setup()
    const created = createTestCase(cases, {
      caseId: 'CASE-1',
      title: 'Laptop seizure',
    })
    expect(created.caseId).toBe('CASE-1')
    expect(created.status).toBe('ACTIVE')
    expect(created.mode).toBe('SINGLE')
    expect(cases.getById('CASE-1')?.title).toBe('Laptop seizure')
  })

  it('rejects duplicate case ids', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'first' })
    expect(() =>
      createTestCase(cases, { caseId: 'CASE-1', title: 'second' }),
    ).toThrow(SecurityError)
  })

  it('rejects malformed case ids and oversized fields', async () => {
    const { cases } = await setup()
    expect(() =>
      createTestCase(cases, { caseId: '../evil', title: 'x' }),
    ).toThrow(SecurityError)
    expect(() => createTestCase(cases, { caseId: 'OK', title: '' })).toThrow(
      SecurityError,
    )
    expect(() =>
      createTestCase(cases, { caseId: 'OK', title: 'x'.repeat(300) }),
    ).toThrow(SecurityError)
  })

  it('update applies only allow-listed fields', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'original' })
    const updated = cases.update('CASE-1', {
      title: 'renamed',
      status: 'ARCHIVED',
    })
    expect(updated.title).toBe('renamed')
    expect(updated.status).toBe('ARCHIVED')
    expect(updated.createdAt).toBe(updated.createdAt)
  })

  it('update REJECTS unknown keys (mass-assignment defense)', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'original' })
    expect(() =>
      cases.update('CASE-1', {
        createdAt: '1999-01-01T00:00:00.000Z',
      } as never),
    ).toThrow(/not updatable/)
    expect(() => cases.update('CASE-1', { caseId: 'CASE-9' } as never)).toThrow(
      /not updatable/,
    )
    // Nothing changed.
    expect(cases.getById('CASE-1')?.title).toBe('original')
  })

  it('update rejects an empty patch', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'x' })
    expect(() => cases.update('CASE-1', {})).toThrow(SecurityError)
  })

  it('scope prevents reading or updating another case', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'one' })
    createTestCase(cases, { caseId: 'CASE-2', title: 'two' })

    const scope = { kind: 'CASE', caseId: 'CASE-1' } as const
    expect(cases.getById('CASE-2', scope)).toBeNull()
    expect(() => cases.update('CASE-2', { title: 'hacked' }, scope)).toThrow(
      /does not exist|outside/,
    )
    expect(cases.getById('CASE-2')?.title).toBe('two')
  })

  it('list respects scope', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'one' })
    createTestCase(cases, { caseId: 'CASE-2', title: 'two' })
    expect(cases.list({ kind: 'ALL' }).length).toBe(2)
    expect(cases.list({ kind: 'CASE', caseId: 'CASE-1' })).toHaveLength(1)
  })

  it('remove deletes an empty case and reports missing ones', async () => {
    const { cases } = await setup()
    createTestCase(cases, { caseId: 'CASE-1', title: 'x' })
    expect(cases.remove('CASE-1')).toBe(true)
    expect(cases.remove('CASE-1')).toBe(false)
    expect(cases.getById('CASE-1')).toBeNull()
  })
})

describe('OperatorRepository', () => {
  it('registers an operator and exposes the level to the permission guard', async () => {
    const { operators } = await setup()
    const record = operators.register({
      operatorId: 'alice',
      permissionLevel: 'OPERATOR',
      registeredBy: 'root-admin',
    })
    expect(record.operatorId).toBe('alice')
    expect(operators.getLevel('alice')).toBe('OPERATOR')
    expect(operators.getLevel('unknown')).toBeNull()
  })

  it('rejects duplicate registration', async () => {
    const { operators } = await setup()
    operators.register({
      operatorId: 'alice',
      permissionLevel: 'READ_ONLY',
      registeredBy: 'root',
    })
    expect(() =>
      operators.register({
        operatorId: 'alice',
        permissionLevel: 'FULL',
        registeredBy: 'root',
      }),
    ).toThrow(SecurityError)
  })

  it('rejects malformed operator ids and levels', async () => {
    const { operators } = await setup()
    expect(() =>
      operators.register({
        operatorId: '../x',
        permissionLevel: 'FULL',
        registeredBy: 'root',
      }),
    ).toThrow(SecurityError)
    expect(() =>
      operators.register({
        operatorId: 'ok',
        permissionLevel: 'SUPERUSER' as never,
        registeredBy: 'root',
      }),
    ).toThrow(SecurityError)
  })

  it('setLevel escalates and demotes explicitly', async () => {
    const { operators } = await setup()
    operators.register({
      operatorId: 'bob',
      permissionLevel: 'READ_ONLY',
      registeredBy: 'root',
    })
    expect(operators.setLevel('bob', 'FULL').permissionLevel).toBe('FULL')
    expect(operators.setLevel('bob', 'READ_ONLY').permissionLevel).toBe(
      'READ_ONLY',
    )
    expect(() => operators.setLevel('ghost', 'FULL')).toThrow(/not registered/)
  })

  it('remove revokes access', async () => {
    const { operators } = await setup()
    operators.register({
      operatorId: 'carol',
      permissionLevel: 'FULL',
      registeredBy: 'root',
    })
    expect(operators.remove('carol')).toBe(true)
    expect(operators.getLevel('carol')).toBeNull()
    expect(operators.remove('carol')).toBe(false)
  })

  it('validates operator ids on reads too', async () => {
    const { operators } = await setup()
    expect(() => operators.getById('bad id')).toThrow(SecurityError)
  })
})

describe('EvidenceRepository', () => {
  async function withCase() {
    const repos = await setup()
    createTestCase(repos.cases, { caseId: 'CASE-1', title: 'forensics' })
    return repos
  }

  it('creates evidence with an initial ACQUIRED custody event', async () => {
    const { evidence } = await withCase()
    const record = evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'DISK_IMAGE',
      sourcePath: 'E:\\captures\\disk.dd',
      sourceSha256: 'a'.repeat(64),
      sizeBytes: 1024,
      operator: 'alice',
    })
    expect(record.evidenceId).toBe('EV-001')
    expect(record.source_sha256).toBe('a'.repeat(64))

    const history = evidence.getCustodyHistory('EV-001')
    expect(history).toHaveLength(1)
    expect(history[0].action).toBe('ACQUIRED')
    expect(history[0].seq).toBe(1)
  })

  it('refuses evidence for a case that does not exist', async () => {
    const { evidence } = await setup()
    expect(() =>
      evidence.create({
        evidenceId: 'EV-X',
        caseId: 'GHOST',
        kind: 'FILE',
        sourcePath: 'x.bin',
        sizeBytes: 1,
        operator: 'alice',
      }),
    ).toThrow(/case GHOST does not exist/)
  })

  it('rejects duplicate evidence ids', async () => {
    const { evidence } = await withCase()
    const input = {
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'FILE' as const,
      sourcePath: 'x.bin',
      sizeBytes: 1,
      operator: 'alice',
    }
    evidence.create(input)
    expect(() => evidence.create(input)).toThrow(SecurityError)
  })

  it('custody sequence increments and is unique per evidence', async () => {
    const { evidence } = await withCase()
    evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'FILE',
      sourcePath: 'x.bin',
      sizeBytes: 1,
      operator: 'alice',
    })
    evidence.appendCustody({
      evidenceId: 'EV-001',
      actor: 'bob',
      action: 'HASHED',
      note: 'sha256 taken',
    })
    evidence.appendCustody({
      evidenceId: 'EV-001',
      actor: 'bob',
      action: 'TRANSFERRED',
    })

    const history = evidence.getCustodyHistory('EV-001')
    expect(history.map((h) => h.seq)).toEqual([1, 2, 3])
    expect(history.map((h) => h.action)).toEqual([
      'ACQUIRED',
      'HASHED',
      'TRANSFERRED',
    ])
  })

  it('scope blocks custody writes and reads for foreign cases', async () => {
    const { evidence, cases } = await withCase()
    createTestCase(cases, { caseId: 'CASE-2', title: 'other' })
    evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-2',
      kind: 'FILE',
      sourcePath: 'y.bin',
      sizeBytes: 1,
      operator: 'alice',
    })

    const scope = { kind: 'CASE', caseId: 'CASE-1' } as const
    expect(evidence.getById('EV-001', scope)).toBeNull()
    expect(() =>
      evidence.appendCustody(
        { evidenceId: 'EV-001', actor: 'mallory', action: 'ANALYZED' },
        scope,
      ),
    ).toThrow(/does not exist|outside/)
    expect(() => evidence.getCustodyHistory('EV-001', scope)).toThrow(
      /does not exist|outside/,
    )
  })

  it('rejects invalid custody actions and bad hashes', async () => {
    const { evidence } = await withCase()
    evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'FILE',
      sourcePath: 'x.bin',
      sizeBytes: 1,
      operator: 'alice',
    })
    expect(() =>
      evidence.appendCustody({
        evidenceId: 'EV-001',
        actor: 'alice',
        action: 'DESTROYED' as never,
      }),
    ).toThrow(SecurityError)
    expect(() =>
      evidence.create({
        evidenceId: 'EV-002',
        caseId: 'CASE-1',
        kind: 'FILE',
        sourcePath: 'x.bin',
        sourceSha256: 'not-a-hash',
        sizeBytes: 1,
        operator: 'alice',
      }),
    ).toThrow(SecurityError)
  })

  it('foreign key enforcement: removing a case with evidence is blocked', async () => {
    const { cases, evidence } = await withCase()
    evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'FILE',
      sourcePath: 'x.bin',
      sizeBytes: 1,
      operator: 'alice',
    })
    expect(() => cases.remove('CASE-1')).toThrow(/evidence records attached/)
    // Removing the evidence first unblocks the case removal.
    expect(evidence.remove('EV-001')).toBe(true)
    expect(cases.remove('CASE-1')).toBe(true)
  })

  it('removing evidence cascades its custody history', async () => {
    const { evidence } = await withCase()
    evidence.create({
      evidenceId: 'EV-001',
      caseId: 'CASE-1',
      kind: 'FILE',
      sourcePath: 'x.bin',
      sizeBytes: 1,
      operator: 'alice',
    })
    evidence.appendCustody({
      evidenceId: 'EV-001',
      actor: 'bob',
      action: 'ANALYZED',
    })
    evidence.remove('EV-001')

    const orphan = db!.driver.all<{ id: number }>(
      'SELECT id FROM custody_events WHERE evidence_id = ?',
      'EV-001',
    )
    expect(orphan).toHaveLength(0)
  })
})
