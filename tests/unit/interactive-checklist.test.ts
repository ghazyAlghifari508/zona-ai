import { describe, expect, it } from 'vitest'
import {
  getStoredArtifactMarkdown,
  setStoredArtifactMarkdown,
  toggleMarkdownTask,
} from '../../src/lib/artifacts/checklist-toggle'

describe('toggleMarkdownTask', () => {
  const sampleMarkdown = `# Checklist Proyek

- [ ] Task pertama
- [x] Task kedua
- [ ] Task ketiga
`

  it('toggles unchecked task 0 to checked', () => {
    const updated = toggleMarkdownTask(sampleMarkdown, 0)
    expect(updated).toContain('- [x] Task pertama')
    expect(updated).toContain('- [x] Task kedua')
    expect(updated).toContain('- [ ] Task ketiga')
  })

  it('toggles checked task 1 to unchecked', () => {
    const updated = toggleMarkdownTask(sampleMarkdown, 1)
    expect(updated).toContain('- [ ] Task pertama')
    expect(updated).toContain('- [ ] Task kedua')
    expect(updated).toContain('- [ ] Task ketiga')
  })

  it('respects explicit nextChecked parameter', () => {
    const updated = toggleMarkdownTask(sampleMarkdown, 0, true)
    expect(updated).toContain('- [x] Task pertama')

    const reUpdated = toggleMarkdownTask(updated, 0, false)
    expect(reUpdated).toContain('- [ ] Task pertama')
  })

  it('returns original markdown when index is out of bounds', () => {
    const updated = toggleMarkdownTask(sampleMarkdown, 99)
    expect(updated).toBe(sampleMarkdown)
  })
})

describe('checklist markdown localStorage persistence', () => {
  it('stores and retrieves modified markdown for an artifact version', () => {
    const key = 'test-artifact-v1'
    const content = '# Custom Checklist\n- [x] Done'
    setStoredArtifactMarkdown(key, content)
    expect(getStoredArtifactMarkdown(key)).toBe(content)
  })

  it('returns null when no content stored', () => {
    expect(getStoredArtifactMarkdown('non-existent-key-123')).toBeNull()
  })
})
