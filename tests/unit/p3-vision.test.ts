import { describe, expect, it } from 'vitest'
import { visionOutcome } from '../../src/lib/models/p3-vision'

describe('visionOutcome', () => {
  it('maps a gateway image media-type rejection to unsupported', () => {
    expect(
      visionOutcome(
        'http-rejected',
        '[400]: validating image item: image media type not supported',
        null,
      ),
    ).toBe('unsupported')
  })

  it('keeps other HTTP rejections inconclusive', () => {
    expect(visionOutcome('http-rejected', 'bad request', null)).toBe(
      'inconclusive',
    )
  })

  it('treats a missing raw body as inconclusive', () => {
    expect(visionOutcome('http-rejected', undefined, null)).toBe('inconclusive')
  })
})
