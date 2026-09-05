const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
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

  return toHex(digest) === params.signatureKey
}
