import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownContent } from '../../src/components/chat/MarkdownContent'
import {
  createChecklistItemId,
  getArtifactChecklistStorageKey,
  getStoredArtifactChecklist,
  getStoredArtifactMarkdown,
  setStoredArtifactChecklist,
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

describe('createChecklistItemId', () => {
  it('creates stable slug from item text', () => {
    expect(createChecklistItemId('Audit environment variables')).toBe(
      'task:audit-environment-variables:0',
    )
    expect(createChecklistItemId('Periksa CORS whitelist', 0)).toBe(
      'task:periksa-cors-whitelist:0',
    )
  })

  it('strips markdown checkbox syntax and special characters', () => {
    expect(createChecklistItemId('[x] Setup PostgreSQL!')).toBe(
      'task:setup-postgresql:0',
    )
    expect(createChecklistItemId('- [ ] Review PR #42 & tests')).toBe(
      'task:review-pr-42-tests:0',
    )
  })

  it('disambiguates duplicate item titles via occurrence', () => {
    const id0 = createChecklistItemId('Review PR', 0)
    const id1 = createChecklistItemId('Review PR', 1)
    expect(id0).toBe('task:review-pr:0')
    expect(id1).toBe('task:review-pr:1')
    expect(id0).not.toBe(id1)
  })
})

describe('getArtifactChecklistStorageKey', () => {
  it('combines artifactId and versionId into a stable key', () => {
    expect(getArtifactChecklistStorageKey('art-1', 'v-1')).toBe(
      'zona-ai:artifact-checklist:art-1:v-1',
    )
  })
})

describe('getStoredArtifactChecklist & setStoredArtifactChecklist', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('stores and retrieves checklist state record', () => {
    const state = {
      'task:item-a:0': true,
      'task:item-b:0': false,
    }
    setStoredArtifactChecklist('art-100', 'v-1', state)
    const retrieved = getStoredArtifactChecklist('art-100', 'v-1')
    expect(retrieved).toEqual(state)
  })

  it('returns empty object for non-existent storage', () => {
    expect(getStoredArtifactChecklist('missing', 'v-0')).toEqual({})
  })

  it('isolates state strictly between different versions of the same artifact', () => {
    setStoredArtifactChecklist('art-100', 'v-1', { 'task:item-a:0': true })
    setStoredArtifactChecklist('art-100', 'v-2', { 'task:item-a:0': false })

    expect(getStoredArtifactChecklist('art-100', 'v-1')['task:item-a:0']).toBe(
      true,
    )
    expect(getStoredArtifactChecklist('art-100', 'v-2')['task:item-a:0']).toBe(
      false,
    )
  })

  it('isolates state strictly between different artifacts', () => {
    setStoredArtifactChecklist('art-alpha', 'v-1', { 'task:task-1:0': true })
    setStoredArtifactChecklist('art-beta', 'v-1', { 'task:task-1:0': false })

    expect(
      getStoredArtifactChecklist('art-alpha', 'v-1')['task:task-1:0'],
    ).toBe(true)
    expect(getStoredArtifactChecklist('art-beta', 'v-1')['task:task-1:0']).toBe(
      false,
    )
  })

  it('migrates legacy markdown storage to structured checklist state', () => {
    const legacyMarkdown = `# Checklist\n- [x] Selesai tugas\n- [ ] Belum selesai`
    setStoredArtifactMarkdown('art-legacy:v-1', legacyMarkdown)

    const migrated = getStoredArtifactChecklist('art-legacy', 'v-1')
    expect(migrated['task:selesai-tugas:0']).toBe(true)
    expect(migrated['task:belum-selesai:0']).toBe(false)
  })
})

describe('MarkdownContent interactive checklist rendering and toggling', () => {
  afterEach(() => {
    cleanup()
  })

  const checklistMarkdown = `# Project Tasks
- [ ] Audit environment variables
- [x] Periksa CORS whitelist
- [ ] Setup PostgreSQL
`

  it('renders tasks with stable item identities and initial checked states', () => {
    render(<MarkdownContent text={checklistMarkdown} />)

    const auditItem = screen.getByTestId(
      'task-item-task:audit-environment-variables:0',
    )
    const corsItem = screen.getByTestId(
      'task-item-task:periksa-cors-whitelist:0',
    )
    const pgItem = screen.getByTestId('task-item-task:setup-postgresql:0')

    expect(auditItem.getAttribute('data-completed')).toBe('false')
    expect(corsItem.getAttribute('data-completed')).toBe('true')
    expect(pgItem.getAttribute('data-completed')).toBe('false')

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0].checked).toBe(false)
    expect(checkboxes[1].checked).toBe(true)
    expect(checkboxes[2].checked).toBe(false)
  })

  it('fires onToggleTask with stable item id when checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(<MarkdownContent text={checklistMarkdown} onToggleTask={onToggle} />)

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(checkboxes[0])

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith(
      'task:audit-environment-variables:0',
      true,
    )
  })

  it('applies taskOverrides cleanly to correct items', () => {
    const overrides = {
      'task:audit-environment-variables:0': true,
      'task:periksa-cors-whitelist:0': false,
    }

    render(
      <MarkdownContent text={checklistMarkdown} taskOverrides={overrides} />,
    )

    const auditItem = screen.getByTestId(
      'task-item-task:audit-environment-variables:0',
    )
    const corsItem = screen.getByTestId(
      'task-item-task:periksa-cors-whitelist:0',
    )

    expect(auditItem.getAttribute('data-completed')).toBe('true')
    expect(corsItem.getAttribute('data-completed')).toBe('false')
  })

  it('preserves checked state by identity when markdown order is changed', () => {
    const reorderedMarkdown = `# Project Tasks
- [ ] Setup PostgreSQL
- [ ] Audit environment variables
- [ ] Periksa CORS whitelist
`
    const overrides = {
      'task:periksa-cors-whitelist:0': true,
    }

    render(
      <MarkdownContent text={reorderedMarkdown} taskOverrides={overrides} />,
    )

    const corsItem = screen.getByTestId(
      'task-item-task:periksa-cors-whitelist:0',
    )
    expect(corsItem.getAttribute('data-completed')).toBe('true')

    const pgItem = screen.getByTestId('task-item-task:setup-postgresql:0')
    expect(pgItem.getAttribute('data-completed')).toBe('false')
  })
})
