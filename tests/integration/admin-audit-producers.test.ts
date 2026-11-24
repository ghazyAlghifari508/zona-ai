/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import {
  adjustUserCreditsCore,
  resetDevCreditsCore,
} from '../../src/server/core/credits'
import { updateFeedbackStatusCore } from '../../src/server/core/feedback'
import {
  banUserCore,
  deleteUserCore,
  unbanUserCore,
} from '../../src/server/core/admin-users'

const harness = vi.hoisted(() => {
  const calls: {
    insert: Array<{ scope: 'db' | 'tx'; value: Record<string, unknown> }>
    update: Array<{ scope: 'db' | 'tx'; value: Record<string, unknown> }>
    transactions: number
  } = { insert: [], update: [], transactions: 0 }

  let selectRows: unknown[] = []
  let updateRows: unknown[] = []
  let executeResults: Array<{ rows: Array<{ credits: number }> }> = []
  let failTxInsert = false

  function makeHandle(scope: 'db' | 'tx') {
    const handle = {
      select: () => ({
        from: () => ({
          where: () => {
            const promise = Promise.resolve(selectRows)
            return Object.assign(promise, { for: () => promise })
          },
          orderBy: () => Promise.resolve(selectRows),
        }),
      }),
      insert: () => ({
        values: async (value: Record<string, unknown>) => {
          calls.insert.push({ scope, value })
          if (scope === 'tx' && failTxInsert) {
            throw new Error('audit insert failed')
          }
        },
      }),
      delete: () => ({
        where: () => ({
          returning: async () => [{ id: 'deleted' }],
        }),
      }),
      update: () => ({
        set: (value: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              calls.update.push({ scope, value })
              return updateRows
            },
          }),
        }),
      }),
      execute: async () => {
        const result = executeResults.shift()
        return result ?? { rows: [] }
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        calls.transactions += 1
        return cb(makeHandle('tx'))
      },
    }
    return handle
  }

  const db = makeHandle('db')
  return {
    calls,
    db,
    setSelectRows: (rows: unknown[]) => {
      selectRows = rows
    },
    setUpdateRows: (rows: unknown[]) => {
      updateRows = rows
    },
    setExecuteResults: (results: Array<{ rows: Array<{ credits: number }> }>) => {
      executeResults = results
    },
    setFailTxInsert: (value: boolean) => {
      failTxInsert = value
    },
  }
})

vi.mock('../../src/lib/db/index', () => ({ db: harness.db }))
vi.mock('../../src/lib/auth/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

const adminSession = {
  session: {
    id: 's-admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: 'admin-1',
    expiresAt: new Date(Date.now() + 86_400_000),
    token: 'tok-admin',
  },
  user: {
    id: 'admin-1',
    email: 'admin@zona.ai',
    name: 'Admin Utama',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'admin',
    banned: false,
  },
}

const request = new Request('http://localhost:3000/admin/audit-log')

function lastAuditMetadata(): unknown {
  const entries = harness.calls.insert.filter(
    (entry) => entry.value.action !== undefined,
  )
  const last = entries.at(-1)
  expect(last).toBeDefined()
  if (!last) throw new Error('Audit insert tidak ditemukan')
  return last.value.metadata
}

describe('P6 audit producer snapshots and atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.calls.insert.length = 0
    harness.calls.update.length = 0
    harness.calls.transactions = 0
    harness.setFailTxInsert(false)
    harness.setSelectRows([])
    harness.setUpdateRows([])
    harness.setExecuteResults([])
    vi.mocked(auth.api.getSession).mockImplementation(async () => adminSession)
  })

  it('keeps the deleted user snapshot in the audit row after deletion', async () => {
    harness.setSelectRows([
      {
        id: 'user-1',
        name: 'Pengguna Lama',
        email: 'lama@example.test',
        role: 'user',
        banned: false,
      },
    ])
    harness.setUpdateRows([{ id: 'user-1' }])

    await deleteUserCore({ request, data: { userId: 'user-1' } })

    const metadata = lastAuditMetadata()
    expect(metadata.targetSnapshot).toEqual({
      id: 'user-1',
      displayName: 'Pengguna Lama',
    })
    expect(metadata.deletedName).toBe('Pengguna Lama')
    expect(metadata.actorSnapshot).toEqual({
      id: 'admin-1',
      displayName: 'Admin Utama',
    })
  })

  it('does not store the deleted email in new audit metadata', async () => {
    harness.setSelectRows([
      {
        id: 'user-privacy',
        name: 'Pengguna Privat',
        email: 'privat@example.test',
        role: 'user',
        banned: false,
      },
    ])
    harness.setUpdateRows([{ id: 'user-privacy' }])

    await deleteUserCore({ request, data: { userId: 'user-privacy' } })

    const metadata = lastAuditMetadata()

    expect(metadata).not.toHaveProperty('deletedEmail')
    expect(JSON.stringify(metadata)).not.toContain('privat@example.test')
  })

  it('stores before/after status for ban and unban instead of null metadata', async () => {
    harness.setSelectRows([
      {
        id: 'user-2',
        name: 'Pengguan Dua',
        email: 'dua@example.test',
        role: 'user',
        banned: false,
      },
    ])
    harness.setUpdateRows([
      {
        id: 'user-2',
        banned: true,
        banReason: 'Pelanggaran',
        banExpires: null,
      },
    ])

    await banUserCore({
      request,
      data: { userId: 'user-2', reason: 'Pelanggaran' },
    })

    expect(lastAuditMetadata()).toMatchObject({
      previousStatus: 'active',
      status: 'banned',
      reason: 'Pelanggaran',
      targetSnapshot: { id: 'user-2', displayName: 'Pengguan Dua' },
    })

    harness.calls.insert.length = 0
    harness.setSelectRows([
      {
        id: 'user-2',
        name: 'Pengguan Dua',
        email: 'dua@example.test',
        role: 'user',
        banned: true,
      },
    ])
    harness.setUpdateRows([{ id: 'user-2', banned: false }])

    await unbanUserCore({ request, data: { userId: 'user-2' } })

    expect(lastAuditMetadata()).toMatchObject({
      previousStatus: 'banned',
      status: 'active',
      targetSnapshot: { id: 'user-2', displayName: 'Pengguan Dua' },
    })
  })

  it('stores old, new and delta balance for credit adjustments', async () => {
    harness.setSelectRows([
      {
        id: 'user-3',
        name: 'Pengguna Tiga',
        email: 'tiga@example.test',
        credits: 80,
      },
    ])

    await adjustUserCreditsCore({
      request,
      data: { userId: 'user-3', amount: 20, mode: 'add', reason: 'Kompensasi' },
    })

    expect(lastAuditMetadata()).toMatchObject({
      oldBalance: 80,
      newBalance: 100,
      delta: 20,
      reason: 'Kompensasi',
      targetSnapshot: { id: 'user-3', displayName: 'Pengguna Tiga' },
    })
  })

  it('writes the dev reset audit in the same transaction as the reset', async () => {
    harness.setSelectRows([
      {
        id: 'user-4',
        name: 'Pengguna Empat',
        email: 'empat@example.test',
        credits: 40,
      },
    ])
    harness.setExecuteResults([
      { rows: [{ credits: 40 }] },
      { rows: [{ credits: 100 }] },
    ])

    await resetDevCreditsCore({ request, targetUserId: 'user-4' })

    expect(harness.calls.transactions).toBeGreaterThan(0)
    expect(
      harness.calls.insert.filter(
        (entry) => entry.value.action === 'credit.reset',
      ),
    ).toHaveLength(1)
    expect(lastAuditMetadata()).toMatchObject({
      oldBalance: 40,
      newBalance: 100,
      delta: 60,
      targetSnapshot: { id: 'user-4', displayName: 'Pengguna Empat' },
    })
  })

  it('rejects the feedback mutation when its audit insert fails in the transaction', async () => {
    harness.setSelectRows([
      {
        id: 'feedback-1',
        title: 'Laporan Masuk',
        status: 'new',
        adminNotes: null,
      },
    ])
    harness.setUpdateRows([
      { id: 'feedback-1', status: 'resolved', adminNotes: null },
    ])
    harness.setFailTxInsert(true)

    await expect(
      updateFeedbackStatusCore({
        request,
        data: { feedbackId: 'feedback-1', status: 'resolved' },
      }),
    ).rejects.toThrow('audit insert failed')

    expect(
      harness.calls.update.filter((entry) => entry.scope === 'db'),
    ).toHaveLength(0)
    expect(
      harness.calls.insert.filter(
        (entry) => entry.value.action === 'feedback.status_update',
      ),
    ).toHaveLength(1)
  })

  it('writes previous/new feedback status without private notes', async () => {
    harness.setSelectRows([
      {
        id: 'feedback-2',
        title: 'Laporan Dua',
        status: 'new',
        adminNotes: 'catatan pribadi',
      },
    ])
    harness.setUpdateRows([
      { id: 'feedback-2', status: 'in_progress', adminNotes: 'catatan pribadi' },
    ])

    await updateFeedbackStatusCore({
      request,
      data: {
        feedbackId: 'feedback-2',
        status: 'in_progress',
        adminNotes: 'catatan pribadi',
      },
    })

    const metadata = lastAuditMetadata()
    expect(metadata).toMatchObject({
      previousStatus: 'new',
      status: 'in_progress',
      targetSnapshot: { id: 'feedback-2', displayName: 'Laporan Dua' },
    })
    expect(JSON.stringify(metadata)).not.toContain('catatan pribadi')
  })
})
