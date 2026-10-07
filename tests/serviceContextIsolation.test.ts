import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ServiceContext } from '../src/main/services/serviceContext'
import { WipeService } from '../src/main/services/wipeService'

const contexts: Array<{ context: ServiceContext; directory: string }> = []

afterEach(async () => {
  for (const { context, directory } of contexts.splice(0)) {
    const database = await context.getDatabase()
    database.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('service context isolation', () => {
  it('persists service audit records in the injected context', async () => {
    const firstDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cybersanitize-context-a-'),
    )
    const secondDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cybersanitize-context-b-'),
    )
    const first = new ServiceContext(firstDir)
    const second = new ServiceContext(secondDir)
    contexts.push(
      { context: first, directory: firstDir },
      { context: second, directory: secondDir },
    )

    const target = path.join(firstDir, 'target.img')
    fs.writeFileSync(target, Buffer.alloc(1024, 0xaa))
    const service = new WipeService(first)

    const result = await service.startWipe(target, 'nist-clear', {
      dryRun: true,
      caseMeta: {
        caseId: 'CASE-ISOLATED',
        operatorId: 'EXAMINER-1',
        role: 'operator',
      },
    })

    expect(result.status).toBe('DRY_RUN')
    expect(
      (await first.getAuditRepository()).list({ caseId: 'CASE-ISOLATED' }),
    ).toHaveLength(1)
    expect(
      (await second.getAuditRepository()).list({ caseId: 'CASE-ISOLATED' }),
    ).toHaveLength(0)
  })
})
