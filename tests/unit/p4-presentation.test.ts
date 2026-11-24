import { describe, expect, it } from 'vitest'
import {
  formatContextWindowTokens,
  getModelAvailability,
  hasVerifiedVision,
} from '../../src/lib/models/presentation'
import type { ModelCatalogEntry } from '../../src/lib/models/types'

function entry(overrides: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry {
  return {
    id: 'cor-prod/model',
    displayName: 'Model',
    provider: 'custom',
    vendor: 'Vendor',
    intelligenceLevel: 3,
    intelligenceScore: 85,
    intelligenceBars: 3,
    confidence: 'high',
    description: '',
    isDefault: false,
    creditTier: 'balanced',
    creditCost: 6,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
    isActive: true,
    evaluationStatus: 'verified',
    ...overrides,
  }
}

describe('P4 model presentation contracts', () => {
  it('formats context windows with Indonesian grouping and explicit missing value', () => {
    expect(formatContextWindowTokens(1_048_576)).toBe('1.048.576 token')
    expect(formatContextWindowTokens(400_000)).toBe('400.000 token')
    expect(formatContextWindowTokens(null)).toBe('—')
    expect(formatContextWindowTokens(undefined)).toBe('—')
  })

  it('shows Vision only for verified support', () => {
    expect(
      hasVerifiedVision(
        entry({
          visionStatus: 'supported',
          capabilities: { ...entry().capabilities, vision: true },
        }),
      ),
    ).toBe(true)
    expect(
      hasVerifiedVision(
        entry({
          visionStatus: 'unverified',
          capabilities: { ...entry().capabilities, vision: true },
        }),
      ),
    ).toBe(false)
    expect(
      hasVerifiedVision(
        entry({
          visionStatus: 'unsupported',
          capabilities: { ...entry().capabilities, vision: true },
        }),
      ),
    ).toBe(false)
    expect(
      hasVerifiedVision(
        entry({ capabilities: { ...entry().capabilities, vision: false } }),
      ),
    ).toBe(false)
  })

  it('maps availability from real state instead of hardcoded premium labels', () => {
    expect(getModelAvailability(entry())).toEqual({
      state: 'ready',
      label: 'Aktif',
      reason: null,
      selectable: true,
    })
    expect(
      getModelAvailability(
        entry({ isActive: false, disabledReason: 'Maintenance window' }),
      ),
    ).toEqual({
      state: 'inactive',
      label: 'Tidak tersedia',
      reason: 'Maintenance window',
      selectable: false,
    })
    expect(
      getModelAvailability(
        entry({ evaluationStatus: 'pending', creditCost: null }),
      ),
    ).toEqual({
      state: 'pending',
      label: 'Belum dievaluasi',
      reason: null,
      selectable: false,
    })
    expect(getModelAvailability(entry({ evaluationStatus: 'failed' }))).toEqual(
      {
        state: 'unverified',
        label: 'Koneksi belum terverifikasi',
        reason: null,
        selectable: false,
      },
    )
    expect(
      getModelAvailability(entry({ evaluationStatus: 'inconclusive' })),
    ).toEqual({
      state: 'unverified',
      label: 'Koneksi belum terverifikasi',
      reason: null,
      selectable: false,
    })
    expect(
      getModelAvailability(
        entry({ evaluationStatus: 'verified', creditCost: null }),
      ),
    ).toEqual({
      state: 'unverified',
      label: 'Koneksi belum terverifikasi',
      reason: null,
      selectable: false,
    })
  })
})
