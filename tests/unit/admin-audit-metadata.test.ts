import { describe, expect, it } from 'vitest'
import {
  auditLogMetadataSchema,
  createAuditMetadata,
  getActorSnapshot,
  getTargetSnapshot,
  parseAuditLogMetadataValue,
  safeTechnicalMetadata,
} from '../../src/lib/admin/audit-metadata'

describe('P6 audit metadata schema', () => {
  it('parses legacy flat metadata and marks only invalid payloads unreadable', () => {
    const legacy = parseAuditLogMetadataValue({
      deletedName: 'Nama Lama',
      deletedEmail: 'private@example.test',
      reason: null,
      count: 2,
    })
    expect(legacy.unreadable).toBe(false)
    expect(legacy.metadata?.deletedName).toBe('Nama Lama')

    const empty = parseAuditLogMetadataValue(null)
    expect(empty).toEqual({ metadata: null, unreadable: false })

    const invalid = parseAuditLogMetadataValue('not-a-record')
    expect(invalid.unreadable).toBe(true)
    expect(invalid.metadata).toBeNull()
  })

  it('parses nested snapshots from new events', () => {
    const metadata = createAuditMetadata({
      actor: { id: 'admin-1', displayName: 'Admin Satu' },
      target: { id: 'user-1', displayName: 'Pengguna Satu' },
      details: {
        previousStatus: 'active',
        status: 'banned',
        nested: { safe: ['a', 1, true, null] },
      },
    })

    expect(auditLogMetadataSchema.safeParse(metadata).success).toBe(true)
    expect(getActorSnapshot(metadata)).toEqual({
      id: 'admin-1',
      displayName: 'Admin Satu',
    })
    expect(getTargetSnapshot(metadata)).toEqual({
      id: 'user-1',
      displayName: 'Pengguna Satu',
    })
  })

  it('ignores malformed snapshots without erasing the event metadata', () => {
    const metadata = parseAuditLogMetadataValue({
      targetSnapshot: { displayName: 'Tanpa ID' },
      deletedName: 'Nama Legacy',
      reason: 'alasan',
    }).metadata

    expect(getTargetSnapshot(metadata)).toBeNull()
    expect(metadata?.deletedName).toBe('Nama Legacy')
  })

  it('redacts private fields and keeps only safe values in the technical view', () => {
    const metadata = parseAuditLogMetadataValue({
      targetSnapshot: { id: 'user-1', displayName: 'Pengguna Satu' },
      deletedEmail: 'private@example.test',
      adminNotes: 'catatan pribadi',
      authorization: 'Bearer secret-token',
      reason: 'alasan admin',
      nested: { apiKey: 'rahasia', status: 'banned' },
      status: 'banned',
      eventCode: 'spoofed',
    }).metadata

    const technical = safeTechnicalMetadata(metadata, {
      eventCode: 'user.ban',
      targetId: 'user-1',
      targetType: 'user',
    })

    expect(technical.eventCode).toBe('user.ban')
    expect(technical.targetId).toBe('user-1')
    expect(JSON.stringify(technical)).not.toContain('private@example.test')
    expect(JSON.stringify(technical)).not.toContain('secret-token')
    expect(JSON.stringify(technical)).not.toContain('catatan pribadi')
    expect(JSON.stringify(technical)).not.toContain('rahasia')
    expect(technical.status).toBe('banned')
  })
})
