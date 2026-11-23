import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { seededRandom } from './p3-suite'

const width = 256
const height = 128
const digits = [
  '75557',
  '26227',
  '71747',
  '71717',
  '55711',
  '74717',
  '74757',
  '71111',
  '75757',
  '75717',
]
const colors = { red: 0xc83030, blue: 0x194fc6, green: 0x228448 } as const

function chunk(name: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(name), bytes])
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function canvas() {
  const stride = 1 + width * 3
  const raster = Buffer.alloc(stride * height, 255)
  for (let y = 0; y < height; y++) raster[y * stride] = 0
  const rect = (x: number, y: number, w: number, h: number, rgb: number) => {
    for (let dy = y; dy < y + h; dy++)
      for (let dx = x; dx < x + w; dx++) {
        const p = dy * stride + 1 + dx * 3
        raster[p] = rgb >> 16
        raster[p + 1] = rgb >> 8
        raster[p + 2] = rgb
      }
  }
  const number = (
    x: number,
    y: number,
    value: string,
    scale = 5,
    color = 0x171717,
  ) => {
    for (const symbol of value) {
      const glyph = digits[Number(symbol)] ?? ''
      for (let row = 0; row < glyph.length; row++)
        for (let column = 0; column < 3; column++) {
          if ((Number(glyph[row]) & (4 >> column)) !== 0)
            rect(x + column * scale, y + row * scale, scale, scale, color)
        }
      x += 4 * scale
    }
  }
  return {
    rect,
    number,
    png() {
      const header = Buffer.alloc(13)
      header.writeUInt32BE(width)
      header.writeUInt32BE(height, 4)
      header[8] = 8
      header[9] = 2
      return Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raster)),
        chunk('IEND', Buffer.alloc(0)),
      ])
    },
  }
}

const domains = ['object', 'ocr', 'chart', 'ui'] as const
export function buildVisionSuite(seed: number) {
  const draw = seededRandom(seed ^ 0xc756)
  return domains.flatMap((domain) =>
    [1, 2].map((index) => {
      const image = canvas()
      let prompt: string
      let expected:
        | string
        | number
        | boolean
        | readonly (string | number | boolean)[]
      if (domain === 'object') {
        const color = (['red', 'blue', 'green'] as const)[draw(3)]
        const count = 2 + draw(4)
        const y = 34 + draw(48)
        for (let i = 0; i < count; i++)
          image.rect(27 + i * 43, y, 25, 25, colors[color])
        prompt =
          'Return [the color in English lowercase, the number of squares]. If no image is available return null.'
        expected = [color, count]
      } else if (domain === 'ocr') {
        const code = String(100000 + draw(900000))
        image.number(54, 42, code, 6)
        prompt =
          'Read the visual code as a JSON string, or null if no image is available.'
        expected = code
      } else if (domain === 'chart') {
        const values = [1 + draw(9), 1 + draw(9), 1 + draw(9)]
        image.rect(15, 96, 225, 2, 0x171717)
        for (const [i, value] of values.entries()) {
          image.rect(36 + i * 72, 96 - value * 8, 32, value * 8, colors.blue)
          image.number(46 + i * 72, 82 - value * 8, String(value), 2)
          image.number(46 + i * 72, 102, String(i + 1), 2)
        }
        prompt =
          'Return the values of bars 1, 2 and 3 as a JSON array in order, or null if no image is available.'
        expected = values
      } else {
        const active = draw(2)
        const label = String(10 + draw(90))
        for (let i = 0; i < 2; i++) {
          image.rect(
            28 + i * 109,
            34,
            90,
            60,
            i === active ? colors.blue : 0xd4d4d4,
          )
          image.number(
            54 + i * 109,
            52,
            i === active ? label : String(((Number(label) + 30) % 90) + 10),
            4,
            i === active ? 0xffffff : 0x171717,
          )
        }
        prompt =
          'The blue button is selected. Return ["left" or "right", selected button label as a string], or null if no image is available.'
        expected = [active === 0 ? 'left' : 'right', label]
      }
      const png = image.png()
      return {
        id: `${domain}-${index}`,
        domain,
        repeat: index === 1,
        prompt,
        expected,
        png,
        hash: createHash('sha256').update(png).digest('hex'),
      }
    }),
  )
}

export type VisionCase = ReturnType<typeof buildVisionSuite>[number]
export type VisionResult = 'correct' | 'wrong' | 'unsupported' | 'inconclusive'

export function visionOutcome(
  state: string,
  raw: string | null | undefined,
  points: number | null,
): VisionResult {
  if (state === 'valid') return points === 1 ? 'correct' : 'wrong'
  if (
    state === 'image-unsupported' ||
    (state === 'http-rejected' &&
      /image\s+(?:media\s+type|input)\s+not\s+supported|unsupported_image|image_input_not_supported/i.test(
        raw ?? '',
      ))
  )
    return 'unsupported'
  return 'inconclusive'
}

export function summarizeVision(
  cases: readonly VisionCase[],
  results: ReadonlyMap<string, VisionResult>,
) {
  if (!results.size) return 'not-tested'
  const primary = cases.map((c) => results.get(c.id))
  if (primary.every((point) => point === 'unsupported')) return 'unsupported'
  if (primary.some((point) => point === undefined || point === 'inconclusive'))
    return 'inconclusive'
  const repeats = cases.filter((c) => c.repeat)
  if (
    repeats.some((c) =>
      [results.get(`${c.id}:repeat`), results.get(`${c.id}:control`)].some(
        (state) => state === undefined || state === 'inconclusive',
      ),
    )
  )
    return 'inconclusive'
  return primary.filter((point) => point === 'correct').length >= 6 &&
    domains.every((d) =>
      cases.some((c) => c.domain === d && results.get(c.id) === 'correct'),
    ) &&
    repeats.every(
      (c) =>
        results.get(c.id) === 'correct' &&
        results.get(`${c.id}:repeat`) === 'correct' &&
        results.get(`${c.id}:control`) === 'wrong',
    )
    ? 'supported'
    : 'unverified'
}
