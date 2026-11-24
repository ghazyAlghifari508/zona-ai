import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getAuditActionLabel } from '../../src/lib/admin/audit-activity'
import { AdminAuditLogView } from '../../src/routes/admin/audit-log'
import type { AuditLogItem } from '../../src/server/core/admin-audit'

const { listAuditLogs } = vi.hoisted(() => ({ listAuditLogs: vi.fn() }))

vi.mock('../../src/server/functions/admin-audit', () => ({
  listAuditLogsFn: (...args: unknown[]) => listAuditLogs(...args),
}))

const callSchema = z.object({
  data: z.object({
    page: z.number(),
    limit: z.number(),
    search: z.string().nullable(),
    action: z.string().nullable(),
  }),
})

const log: AuditLogItem = {
  id: 'log-1',
  adminId: 'admin-1',
  adminEmail: 'admin@zona.ai',
  adminName: 'Admin Utama',
  adminImage: null,
  action: 'user.ban',
  targetId: 'user-1',
  targetType: 'user',
  metadata: {
    actorSnapshot: { id: 'admin-1', displayName: 'Admin Tersimpan' },
    targetSnapshot: { id: 'user-1', displayName: 'Nama Tersimpan' },
    previousStatus: 'active',
    status: 'banned',
    reason: 'Pelanggaran',
    adminNotes: 'catatan privat yang tidak boleh tampil',
  },
  metadataUnreadable: false,
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
}

const emptyResponse = {
  items: [],
  pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
}

function renderView(items: AuditLogItem[] = [log]) {
  return render(
    <AdminAuditLogView
      initialData={{
        items,
        pagination: {
          total: items.length,
          page: 1,
          limit: 20,
          totalPages: items.length === 0 ? 0 : 1,
        },
      }}
    />,
  )
}

function lastCallData() {
  return callSchema.parse(listAuditLogs.mock.calls.at(-1)?.[0]).data
}

describe('AdminAuditLogView', () => {
  beforeEach(() => {
    listAuditLogs.mockReset()
    listAuditLogs.mockResolvedValue({
      items: [log],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })
  afterEach(() => {
    cleanup()
  })

  it('renders human-readable activity and target labels', () => {
    renderView()

    expect(
      screen.getAllByText(getAuditActionLabel('user.ban')).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Nama Tersimpan').length).toBeGreaterThan(0)
    expect(screen.queryByText('user.ban')).toBeNull()
  })

  it('opens event details from the table', () => {
    renderView()

    fireEvent.click(
      screen.getAllByTestId('admin-audit-detail-button')[0] ?? document.body,
    )

    expect(screen.getByTestId('admin-audit-dialog')).toBeDefined()
    expect(
      screen.getAllByTestId('admin-audit-detail-value').length,
    ).toBeGreaterThan(1)
    expect(screen.getAllByText('Nama Tersimpan').length).toBeGreaterThan(0)
  })

  it('shows redacted technical metadata when expanded', () => {
    renderView()

    fireEvent.click(
      screen.getAllByTestId('admin-audit-detail-button')[0] ?? document.body,
    )
    fireEvent.click(screen.getByTestId('admin-audit-technical-trigger'))

    const technical =
      screen.getByTestId('admin-audit-technical-json').textContent ?? ''
    expect(technical).toContain('eventCode')
    expect(technical).toContain('user-1')
    expect(technical).not.toContain('catatan privat')
  })

  it('copies only safe technical JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderView()

    fireEvent.click(
      screen.getAllByTestId('admin-audit-detail-button')[0] ?? document.body,
    )
    fireEvent.click(screen.getByTestId('admin-audit-copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('eventCode')
    expect(copied).not.toContain('catatan privat')
  })

  it('resets paging when the action filter changes', async () => {
    renderView()

    fireEvent.change(screen.getByTestId('admin-audit-action-filter'), {
      target: { value: 'user.ban' },
    })

    await waitFor(() => expect(lastCallData().action).toBe('user.ban'))
    expect(lastCallData().page).toBe(1)
  })

  it('passes a trimmed search term and resets paging', async () => {
    renderView()

    fireEvent.change(screen.getByTestId('admin-audit-search'), {
      target: { value: '  Nama  ' },
    })
    fireEvent.submit(
      screen.getByTestId('admin-audit-search').closest('form') ?? document.body,
    )

    await waitFor(() => expect(lastCallData().search).toBe('Nama'))
    expect(lastCallData().page).toBe(1)
  })

  it('shows an error and retries the current query', async () => {
    listAuditLogs.mockRejectedValueOnce(new Error('network'))
    renderView()

    fireEvent.change(screen.getByTestId('admin-audit-action-filter'), {
      target: { value: 'credit.adjust' },
    })

    await waitFor(() =>
      expect(screen.getByTestId('admin-audit-error')).toBeDefined(),
    )
    fireEvent.click(screen.getByTestId('admin-audit-retry'))

    await waitFor(() =>
      expect(screen.queryByTestId('admin-audit-error')).toBeNull(),
    )
    expect(lastCallData().action).toBe('credit.adjust')
  })

  it('renders an empty state without detail actions', () => {
    listAuditLogs.mockResolvedValue(emptyResponse)
    renderView([])

    expect(screen.getByTestId('admin-audit-empty')).toBeDefined()
    expect(screen.queryAllByTestId('admin-audit-detail-button')).toHaveLength(0)
  })
})
