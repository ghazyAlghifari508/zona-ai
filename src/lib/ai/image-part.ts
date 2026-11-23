export function imagePart(bytes: Buffer, mediaType: string) {
  return { type: 'file' as const, data: bytes.toString('base64'), mediaType }
}
