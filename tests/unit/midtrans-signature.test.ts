import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyStatusSignature } from '../../src/lib/midtrans/signature'

const SERVER_KEY = 'SB-Mid-server-test-key'

function oracle(input: string): string {
  return createHash('sha512').update(input).digest('hex')
}

describe('verifyStatusSignature', () => {
  it('accepts a signature built with the raw gross_amount string', async () => {
    const signature = oracle(`order-120049000.00${SERVER_KEY}`)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey: signature,
    })

    expect(ok).toBe(true)
  })

  it('rejects a signature built from the reformatted integer amount', async () => {
    const signature = oracle(`order-120049000${SERVER_KEY}`)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey: signature,
    })

    expect(ok).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const signature = oracle(`order-120049000.00${SERVER_KEY}`)
    const ok = await verifyStatusSignature({
      orderId: 'order-1',
      statusCode: '200',
      grossAmountRaw: '49000.00',
      serverKey: SERVER_KEY,
      signatureKey:
        signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0'),
    })

    expect(ok).toBe(false)
  })
})
