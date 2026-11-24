import { describe, expect, it } from 'vitest'
import {
  AUDIT_ACTION_CODES,
  AUDIT_ACTION_FILTER_OPTIONS,
  getAuditActionLabel,
  presentAuditActivity,
} from '../../src/lib/admin/audit-activity'
import { parseAuditLogMetadataValue } from '../../src/lib/admin/audit-metadata'

function activity(
  overrides: Partial<Parameters<typeof presentAuditActivity>[0]> = {},
) {
  return presentAuditActivity({
    action: 'model.disable',
    metadata: null,
    adminId: 'admin-1',
    adminEmail: 'admin@example.test',
    currentActorName: 'Admin Saat Ini',
    targetId: 'model-1',
    targetType: 'model',
    currentTargetName: 'Model Saat Ini',
    ...overrides,
  })
}

describe('P6 shared activity presentation', () => {
  it('maps every real producer code, including user.delete and connection tests', () => {
    expect(AUDIT_ACTION_CODES).toEqual(
      expect.arrayContaining([
        'model.enable',
        'model.disable',
        'model.create',
        'model.update',
        'model.delete',
        'model.connection_test',
        'user.ban',
        'user.unban',
        'user.delete',
        'credit.adjust',
        'credit.reset',
        'feedback.status_update',
      ]),
    )
    expect(AUDIT_ACTION_FILTER_OPTIONS[0]).toEqual({
      value: 'all',
      label: 'Semua aktivitas',
    })
    expect(getAuditActionLabel('model.disable')).toBe('Menonaktifkan model')
    expect(getAuditActionLabel('user.delete')).toBe('Menghapus pengguna')
    expect(getAuditActionLabel('feedback.status_update')).toBe(
      'Memperbarui status feedback',
    )
    expect(getAuditActionLabel('legacy.unknown')).toBe('Aktivitas lainnya')
  })

  it('keeps internal codes as filter values with human labels', () => {
    const option = AUDIT_ACTION_FILTER_OPTIONS.find(
      (item) => item.value === 'credit.adjust',
    )
    expect(option?.label).toBe('Menyesuaikan kredit')
    expect(
      AUDIT_ACTION_FILTER_OPTIONS.every(
        (item) =>
          item.value === 'all' || AUDIT_ACTION_CODES.includes(item.value),
      ),
    ).toBe(true)
  })

  it('prefers snapshots, then legacy names, then current lookup, then a truthful fallback', () => {
    expect(
      activity({
        metadata: parseAuditLogMetadataValue({
          targetSnapshot: { id: 'model-1', displayName: 'Nama Tersimpan' },
        }).metadata,
      }).targetLabel,
    ).toBe('Nama Tersimpan')

    expect(
      activity({
        action: 'user.delete',
        metadata: parseAuditLogMetadataValue({
          deletedName: 'Nama Sebelum Dihapus',
        }).metadata,
      }).targetLabel,
    ).toBe('Nama Sebelum Dihapus')

    expect(activity({}).targetLabel).toBe('Model Saat Ini')
    expect(activity({ currentTargetName: null }).targetLabel).toBe(
      'Nama tidak tersedia',
    )
  })

  it('uses actor snapshot before a current account name, email and raw ID', () => {
    expect(
      activity({
        metadata: parseAuditLogMetadataValue({
          actorSnapshot: { id: 'admin-1', displayName: 'Admin Tersimpan' },
        }).metadata,
      }).actorLabel,
    ).toBe('Admin Tersimpan')
    expect(activity({}).actorLabel).toBe('Admin Saat Ini')
    expect(
      activity({ currentActorName: null, adminEmail: 'admin@example.test' })
        .actorLabel,
    ).toBe('admin@example.test')
    expect(
      activity({ currentActorName: null, adminEmail: '', adminId: 'admin-1' })
        .actorLabel,
    ).toBe('admin-1')
  })

  it('does not invent a previous status for legacy events', () => {
    const result = activity({
      metadata: parseAuditLogMetadataValue({
        disabledReason: 'Perbaikan',
      }).metadata,
    })
    expect(result.details).toEqual([
      { label: 'Status sebelumnya', value: 'Tidak tercatat' },
      { label: 'Status sesudah', value: 'Tidak tercatat' },
      { label: 'Alasan', value: 'Perbaikan' },
    ])
  })

  it('shows stored model status changes and reasons', () => {
    const result = activity({
      metadata: parseAuditLogMetadataValue({
        previousStatus: 'active',
        status: 'inactive',
        reason: 'Maintenance',
      }).metadata,
    })
    expect(result.details).toEqual([
      { label: 'Status sebelumnya', value: 'Aktif' },
      { label: 'Status sesudah', value: 'Nonaktif' },
      { label: 'Alasan', value: 'Maintenance' },
    ])
  })

  it('adapts details to credit and feedback events', () => {
    const credit = activity({
      action: 'credit.adjust',
      metadata: parseAuditLogMetadataValue({
        oldBalance: 80,
        newBalance: 100,
        delta: 20,
        reason: 'Kompensasi',
      }).metadata,
    })
    expect(credit.details).toContainEqual({
      label: 'Saldo sebelumnya',
      value: '80',
    })
    expect(credit.details).toContainEqual({ label: 'Perubahan', value: '+20' })
    expect(credit.details).toContainEqual({
      label: 'Alasan',
      value: 'Kompensasi',
    })

    const feedback = activity({
      action: 'feedback.status_update',
      metadata: parseAuditLogMetadataValue({
        previousStatus: 'new',
        status: 'resolved',
      }).metadata,
    })
    expect(feedback.details).toContainEqual({
      label: 'Status sebelumnya',
      value: 'Baru',
    })
    expect(feedback.details).toContainEqual({
      label: 'Status sesudah',
      value: 'Selesai',
    })
  })

  it('reports connection-test outcome without claiming success', () => {
    const failed = activity({
      action: 'model.connection_test',
      metadata: parseAuditLogMetadataValue({
        outcome: 'auth_failure',
        httpStatus: 401,
      }).metadata,
    })
    expect(failed.details).toContainEqual({
      label: 'Hasil',
      value: 'Pemeriksaan gagal',
    })

    const passed = activity({
      action: 'model.connection_test',
      metadata: parseAuditLogMetadataValue({ outcome: 'valid' }).metadata,
    })
    expect(passed.details).toContainEqual({
      label: 'Hasil',
      value: 'Pemeriksaan berhasil',
    })
  })

  it('keeps unknown events readable and labels unreadable metadata', () => {
    const result = activity({
      action: 'legacy.custom',
      metadataUnreadable: true,
    })
    expect(result.actionLabel).toBe('Aktivitas lainnya')
    expect(result.technical.eventCode).toBe('legacy.custom')
    expect(result.technical.note).toBe('Metadata tidak dapat dibaca')
  })

  it('builds a safe technical section from the event context', () => {
    const result = activity({
      metadata: parseAuditLogMetadataValue({
        deletedEmail: 'private@example.test',
        targetSnapshot: { id: 'model-1', displayName: 'Model Tersimpan' },
        status: 'inactive',
      }).metadata,
    })
    expect(result.technical.eventCode).toBe('model.disable')
    expect(result.technical.targetId).toBe('model-1')
    expect(JSON.stringify(result.technical)).not.toContain(
      'private@example.test',
    )
  })
})
