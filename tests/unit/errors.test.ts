import { describe, expect, it } from 'vitest'
import {
  getZonaError,
  throwZonaError,
  ZONA_ERROR_CODES,
} from '../../src/lib/utils/errors'

describe('errors', () => {
  it('ERR-001 maps to 502 retryable', () => {
    const e = getZonaError('ERR-001')
    expect(e.code).toBe('ERR-001')
    expect(e.status).toBe(502)
    expect(e.retryable).toBe(true)
  })

  it('ERR-019 maps to 402 insufficient credits', () => {
    const e = getZonaError('ERR-019')
    expect(e.status).toBe(402)
    expect(e.retryable).toBe(false)
    expect(e.message).toContain('Kredit')
  })

  it('ERR-002 maps to 401 login action', () => {
    const e = getZonaError('ERR-002')
    expect(e.status).toBe(401)
    expect(e.action).toBe('login')
  })

  it('throwZonaError throws with status and code', () => {
    expect(() => throwZonaError('ERR-003')).toThrow(/ERR-003/)
    try {
      throwZonaError('ERR-003')
    } catch (err) {
      const e = err as { status: number; code: string; retryable: boolean }
      expect(e.status).toBe(400)
      expect(e.code).toBe('ERR-003')
      expect(e.retryable).toBe(false)
    }
  })

  it('all 21 codes defined (ERR-001..ERR-021)', () => {
    expect(ZONA_ERROR_CODES).toHaveLength(21)
    for (let i = 1; i <= 21; i++) {
      const code = `ERR-${String(i).padStart(3, '0')}`
      expect(getZonaError(code)).toBeDefined()
      expect(getZonaError(code).code).toBe(code)
    }
  })

  it('unknown code throws', () => {
    expect(() => getZonaError('ERR-999')).toThrow(/Unknown/)
  })
})
