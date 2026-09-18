const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)
  let mismatch = aLen ^ bLen
  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0
    const charB = i < bLen ? b.charCodeAt(i) : 0
    mismatch |= charA ^ charB
  }
  return mismatch === 0
}

export async function verifyStatusSignature(params: {
  orderId: string
  statusCode: string
  grossAmountRaw: string
  serverKey: string
  signatureKey: string
}): Promise<boolean> {
  const raw =
    params.orderId +
    params.statusCode +
    params.grossAmountRaw +
    params.serverKey
  const digest = await crypto.subtle.digest('SHA-512', encoder.encode(raw))

  return timingSafeEqual(toHex(digest), params.signatureKey)
}
