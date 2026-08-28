import { describe, expect, it } from 'vitest'
import { generateTitle } from '../../src/lib/utils/title'

describe('generateTitle', () => {
  it('keeps a short first line', () => {
    expect(generateTitle('  halo  \nignored')).toBe('halo')
  })

  it('truncates long text to 60 characters plus an ellipsis', () => {
    const title = generateTitle('a'.repeat(100))
    expect(title).toHaveLength(61)
    expect(title.endsWith('…')).toBe(true)
  })

  it('uses New Chat for an empty first line', () => {
    expect(generateTitle(' \nignored')).toBe('New Chat')
  })
})
