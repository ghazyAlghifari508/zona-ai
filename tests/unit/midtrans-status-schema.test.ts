import { describe, expect, it } from 'vitest'
import {
  mapMidtransStatus,
  midtransStatusSchema,
} from '../../src/lib/midtrans/status-schema'

const baseStatus = {
  order_id: 'zona-pro-550e8400-e29b-41d4-a716-446655440000',
  status_code: '200',
  gross_amount: '49000.00',
  transaction_status: 'settlement',
  signature_key: 'a'.repeat(128),
}

describe('midtransStatusSchema', () => {
  it('parses the documented Get Status response', () => {
    const parsed = midtransStatusSchema.parse({
      ...baseStatus,
      transaction_id: '57d5293c-e65f-4a29-95e4-5959c3fa335b',
      payment_type: 'credit_card',
      fraud_status: 'accept',
      settlement_time: '2020-01-10 16:15:31',
      merchant_id: 'M004123',
      masked_card: '48111111-1114',
    })

    expect(parsed.order_id).toBe(baseStatus.order_id)
    expect(parsed).not.toHaveProperty('merchant_id')
  })

  it('keeps gross_amount as the raw provider string', () => {
    const parsed = midtransStatusSchema.parse(baseStatus)

    expect(parsed.gross_amount).toBe('49000.00')
  })

  it('tolerates missing optional fields', () => {
    const parsed = midtransStatusSchema.parse(baseStatus)

    expect(parsed.payment_type).toBeUndefined()
    expect(parsed.fraud_status).toBeUndefined()
  })

  it('rejects when a core field is missing', () => {
    const { signature_key: _signatureKey, ...withoutSignature } = baseStatus

    expect(midtransStatusSchema.safeParse(withoutSignature).success).toBe(false)
    expect(
      midtransStatusSchema.safeParse({ ...baseStatus, gross_amount: 49000 })
        .success,
    ).toBe(false)
  })
})

describe('mapMidtransStatus', () => {
  it.each([
    ['capture', 'paid'],
    ['settlement', 'paid'],
    ['pending', 'pending'],
    ['deny', 'failed'],
    ['cancel', 'cancelled'],
    ['expire', 'expired'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(mapMidtransStatus({ ...baseStatus, transaction_status: raw })).toBe(
      expected,
    )
  })

  it.each(['refund', 'partial_refund'])(
    'throws on out-of-scope %s status',
    (transactionStatus) => {
      expect(() =>
        mapMidtransStatus({
          ...baseStatus,
          transaction_status: transactionStatus,
        }),
      ).toThrow()
    },
  )

  it('throws on unknown statuses', () => {
    expect(() =>
      mapMidtransStatus({ ...baseStatus, transaction_status: 'mystery' }),
    ).toThrow()
  })
})
