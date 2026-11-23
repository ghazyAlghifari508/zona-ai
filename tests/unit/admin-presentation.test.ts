import { describe, expect, it } from 'vitest'
import {
  formatFeedbackCategory,
  formatFeedbackStatus,
  formatUserBlocked,
  formatUserRole,
} from '../../src/lib/admin/presentation'

describe('P4 admin status labels', () => {
  it('uses sentence-case role labels', () => {
    expect(formatUserRole('admin')).toBe('Admin')
    expect(formatUserRole('user')).toBe('Pengguna')
    expect(formatUserRole('unknown')).toBe('Pengguna')
  })

  it('uses explicit account state instead of online-status colors', () => {
    expect(formatUserBlocked(false)).toBe('Tidak diblokir')
    expect(formatUserBlocked(true)).toBe('Diblokir')
  })

  it('maps feedback status to the approved sentence-case labels', () => {
    expect(formatFeedbackStatus('new')).toBe('Baru')
    expect(formatFeedbackStatus('in_progress')).toBe('Diproses')
    expect(formatFeedbackStatus('resolved')).toBe('Selesai')
    expect(formatFeedbackStatus('rejected')).toBe('Ditolak')
    expect(formatFeedbackStatus('unexpected')).toBe('Baru')
  })

  it('maps feedback category to the approved sentence-case labels', () => {
    expect(formatFeedbackCategory('general')).toBe('Umum')
    expect(formatFeedbackCategory('feature')).toBe('Saran fitur')
    expect(formatFeedbackCategory('bug')).toBe('Laporan bug')
    expect(formatFeedbackCategory('unexpected')).toBe('Umum')
  })
})
