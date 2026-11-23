import { describe, expect, it } from 'vitest'
import {
  adminModelIdSchema,
  createAdminModelInputSchema,
  publishAdminModelInputSchema,
  updateAdminModelInputSchema,
} from '../../src/lib/models/admin-model-input'

describe('admin model id boundary', () => {
  it('preserves exact route identity', () => {
    for (const id of [
      'cx/deepseek-chat',
      'cx/deepseek-reasoner',
      'cc/claude-sonnet-4-20250514',
      'provider/model:free',
      'Vendor.Model_v2/route-1',
    ]) {
      expect(adminModelIdSchema.parse(`  ${id}  `)).toBe(id)
    }
  })

  it('rejects reserved, empty and URL-shaped ids', () => {
    for (const id of [
      '',
      'auto',
      ' AUTO ',
      'https://evil.example/model',
      '../model',
      'a b',
    ]) {
      expect(adminModelIdSchema.safeParse(id).success).toBe(false)
    }
  })

  it('keeps two routes with the same basename distinct', () => {
    expect(adminModelIdSchema.parse('cx/deepseek-chat')).not.toBe(
      adminModelIdSchema.parse('cx/deepseek-reasoner'),
    )
  })
})

describe('admin model mutation schemas', () => {
  const valid = {
    modelId: 'cx/deepseek-chat',
    displayName: 'DeepSeek Chat',
    vendor: 'DeepSeek',
    provider: 'cx',
    description: 'Route on the configured gateway',
    searchAliases: ['deepseek'],
    contextWindow: 65536,
  }

  it('accepts editable metadata and rejects unverified benchmark fields', () => {
    expect(createAdminModelInputSchema.safeParse(valid).success).toBe(true)

    const forged = createAdminModelInputSchema.safeParse({
      ...valid,
      intelligenceScore: 100,
      creditCost: 3,
      capabilities: { vision: true },
    })
    expect(forged.success).toBe(false)
  })

  it('requires a route and allows only editable fields on update', () => {
    const { contextWindow: _contextWindow, ...updateValid } = valid
    expect(updateAdminModelInputSchema.safeParse(updateValid).success).toBe(
      true,
    )
    expect(
      updateAdminModelInputSchema.safeParse({ ...updateValid, id: 'other' })
        .success,
    ).toBe(false)
    expect(
      updateAdminModelInputSchema.safeParse({ displayName: '' }).success,
    ).toBe(false)
  })

  it('requires evidence for a guarded evaluation publication', async () => {
    const result = publishAdminModelInputSchema.safeParse({
      modelId: 'custom/route:free',
      run: 'trusted-run-1',
    })
    expect(result.success).toBe(true)
    expect(
      publishAdminModelInputSchema.safeParse({
        ...result.data,
        run: '../outside-checkpoint',
      }).success,
    ).toBe(false)
  })
})
