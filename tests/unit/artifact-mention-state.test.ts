import { describe, expect, it } from 'vitest'
import type { ArtifactSummary } from '../../src/lib/artifacts/contracts'
import {
  addArtifactMention,
  addOrFocusArtifactMention,
  filterArtifactMentions,
  findActiveMentionQuery,
  moveMentionPickerSelection,
  removeArtifactMention,
  replaceActiveMentionQuery,
  setArtifactMentionMode,
  type ArtifactMentionCandidate,
  type ArtifactMentionDraftState,
} from '../../src/lib/artifacts/mentions'

function makeCandidate(
  idSuffix: string,
  title: string,
  fileName: string,
  kindLabel: string = 'PRD',
  modelDisplayName: string = 'Gemini 3.7',
): ArtifactMentionCandidate {
  const artifact: ArtifactSummary = {
    artifactId: `10000000-0000-4000-8000-0000000000${idSuffix}`,
    kind: 'prd',
    title,
    attachmentId: `20000000-0000-4000-8000-0000000000${idSuffix}`,
    fileName,
    fileSize: 100,
    mimeType: 'text/markdown',
    modelId: 'gemini-3.7-flash-high',
    routerModelId: 'google/gemini-2.5-flash',
    currentVersionId: `30000000-0000-4000-8000-0000000000${idSuffix}`,
    currentVersion: 1,
    versionCount: 1,
    updatedAt: new Date('2026-09-08T00:00:00Z'),
  }
  return {
    artifact,
    kindLabel,
    modelDisplayName,
  }
}

describe('findActiveMentionQuery', () => {
  it('detects a bare @ at caret', () => {
    const text = 'Hello @'
    const query = findActiveMentionQuery(text, text.length)
    expect(query).toEqual({ start: 6, end: 7, query: '' })
  })

  it('detects @query with text', () => {
    const text = 'Explain @prd for me'
    const query = findActiveMentionQuery(text, 12) // caret right after @prd
    expect(query).toEqual({ start: 8, end: 12, query: 'prd' })
  })

  it('ignores @ inside an email address', () => {
    const text = 'contact user@example.com for info'
    const query = findActiveMentionQuery(text, 18)
    expect(query).toBeNull()
  })

  it('stops query extraction at whitespace after @', () => {
    const text = 'Check @prd done'
    const query = findActiveMentionQuery(text, text.length)
    expect(query).toBeNull()
  })

  it('handles caret in the middle of a mention query', () => {
    const text = 'Review @release-plan later'
    const query = findActiveMentionQuery(text, 15) // caret at @release
    expect(query).toEqual({ start: 7, end: 15, query: 'release' })
  })
})

describe('replaceActiveMentionQuery', () => {
  it('removes the active mention query range from text and places caret at removal site', () => {
    const text = 'Please review @rel and summarize'
    const query = { start: 14, end: 18, query: 'rel' }
    const replaced = replaceActiveMentionQuery(text, query)
    expect(replaced.text).toBe('Please review  and summarize')
    expect(replaced.caret).toBe(14)
  })

  it('cleans up trailing space when mention query is at end of text', () => {
    const text = 'Check @'
    const query = { start: 6, end: 7, query: '' }
    const replaced = replaceActiveMentionQuery(text, query)
    expect(replaced.text).toBe('Check ')
    expect(replaced.caret).toBe(6)
  })
})

describe('filterArtifactMentions', () => {
  const c1 = makeCandidate('01', 'Release Plan', 'release-plan.md', 'PRD', 'GPT-5')
  const c2 = makeCandidate('02', 'Plan Overview', 'overview.md', 'Checklist', 'Claude 3.7')
  const c3 = makeCandidate('03', 'Agent Guidelines', 'guidelines.md', 'Agent Skill', 'Gemini 3.7')

  it('returns all candidates when query is empty', () => {
    const results = filterArtifactMentions([c1, c2, c3], '')
    expect(results).toHaveLength(3)
  })

  it('ranks exact match first, then prefix, then substring', () => {
    const results = filterArtifactMentions([c2, c1, c3], 'release plan')
    expect(results).toHaveLength(1)
    expect(results[0].artifact.title).toBe('Release Plan')
  })

  it('searches across title, filename, kindLabel, and modelDisplayName case-insensitively', () => {
    const byKind = filterArtifactMentions([c1, c2, c3], 'checklist')
    expect(byKind).toHaveLength(1)
    expect(byKind[0].artifact.title).toBe('Plan Overview')

    const byModel = filterArtifactMentions([c1, c2, c3], 'claude')
    expect(byModel).toHaveLength(1)
    expect(byModel[0].artifact.title).toBe('Plan Overview')

    const byFilename = filterArtifactMentions([c1, c2, c3], 'guidelines.md')
    expect(byFilename).toHaveLength(1)
    expect(byFilename[0].artifact.title).toBe('Agent Guidelines')
  })

  it('returns empty array when no candidates match', () => {
    const results = filterArtifactMentions([c1, c2, c3], 'nonexistent')
    expect(results).toHaveLength(0)
  })
})

describe('mention draft state reducers', () => {
  const c1 = makeCandidate('01', 'Doc 1', 'doc-1.md')
  const c2 = makeCandidate('02', 'Doc 2', 'doc-2.md')
  const c3 = makeCandidate('03', 'Doc 3', 'doc-3.md')
  const c4 = makeCandidate('04', 'Doc 4', 'doc-4.md')
  const c5 = makeCandidate('05', 'Doc 5', 'doc-5.md')

  const initialState: ArtifactMentionDraftState = {
    mentions: [],
    activeQuery: null,
    selectedIndex: 0,
    feedback: null,
  }

  it('adds a mention draft and sets default mode', () => {
    const next = addArtifactMention(initialState, c1, 'context')
    expect(next.mentions).toHaveLength(1)
    expect(next.mentions[0].artifactId).toBe(c1.artifact.artifactId)
    expect(next.mentions[0].mode).toBe('context')
    expect(next.mentions[0].title).toBe('Doc 1')
    expect(next.feedback).toBeNull()
  })

  it('blocks adding the same artifact twice with feedback', () => {
    const s1 = addArtifactMention(initialState, c1, 'context')
    const s2 = addArtifactMention(s1, c1, 'revise')
    expect(s2.mentions).toHaveLength(1)
    expect(s2.feedback).toContain('sudah ditambahkan')
  })

  it('blocks adding more than 4 mentions with feedback', () => {
    let state = initialState
    state = addArtifactMention(state, c1, 'context')
    state = addArtifactMention(state, c2, 'context')
    state = addArtifactMention(state, c3, 'context')
    state = addArtifactMention(state, c4, 'context')
    expect(state.mentions).toHaveLength(4)

    const overflow = addArtifactMention(state, c5, 'context')
    expect(overflow.mentions).toHaveLength(4)
    expect(overflow.feedback).toContain('Maksimal 4 mention')
  })

  it('removes a mention by artifactId', () => {
    const s1 = addArtifactMention(initialState, c1, 'context')
    const s2 = addArtifactMention(s1, c2, 'context')
    const removed = removeArtifactMention(s2, c1.artifact.artifactId)
    expect(removed.mentions).toHaveLength(1)
    expect(removed.mentions[0].artifactId).toBe(c2.artifact.artifactId)
  })

  it('updates the mention mode for an artifact', () => {
    const s1 = addArtifactMention(initialState, c1, 'context')
    const updated = setArtifactMentionMode(s1, c1.artifact.artifactId, 'revise')
    expect(updated.mentions[0].mode).toBe('revise')
  })

  it('wraps keyboard selection index on moveMentionPickerSelection', () => {
    const s1 = { ...initialState, selectedIndex: 0 }
    // Move up (direction -1) when at 0 wraps to end
    const wrappedEnd = moveMentionPickerSelection(s1, -1, 3)
    expect(wrappedEnd.selectedIndex).toBe(2)

    // Move down (direction 1) wraps to 0
    const wrappedStart = moveMentionPickerSelection(wrappedEnd, 1, 3)
    expect(wrappedStart.selectedIndex).toBe(0)
  })
})

describe('addOrFocusArtifactMention (canvas bridge)', () => {
  const f1 = makeCandidate('01', 'Release Plan', 'release-plan.md')
  const baseState: ArtifactMentionDraftState = {
    mentions: [],
    activeQuery: null,
    selectedIndex: 0,
    feedback: null,
  }

  it('adds a new chip when the artifact is not mentioned yet', () => {
    const next = addOrFocusArtifactMention(baseState, f1, 'context')
    expect(next.mentions).toHaveLength(1)
    expect(next.mentions[0].artifactId).toBe(f1.artifact.artifactId)
    expect(next.mentions[0].mode).toBe('context')
  })

  it('switches an existing chip to the requested mode instead of blocking', () => {
    const existing = addArtifactMention(baseState, f1, 'context')
    const focused = addOrFocusArtifactMention(existing, f1, 'revise')
    expect(focused.mentions).toHaveLength(1)
    expect(focused.mentions[0].artifactId).toBe(f1.artifact.artifactId)
    expect(focused.mentions[0].mode).toBe('revise')
    expect(focused.feedback).toBeNull()
  })

  it('updates an existing chip to the candidate current version', () => {
    const newerCandidate: ArtifactMentionCandidate = {
      artifact: {
        ...f1.artifact,
        currentVersionId: '40000000-0000-4000-8000-000000000001',
        currentVersion: 2,
      },
      kindLabel: f1.kindLabel,
      modelDisplayName: f1.modelDisplayName,
    }
    const existing = addArtifactMention(baseState, f1, 'context')
    const refocused = addOrFocusArtifactMention(
      existing,
      newerCandidate,
      'context',
    )
    expect(refocused.mentions).toHaveLength(1)
    expect(refocused.mentions[0].versionId).toBe(
      '40000000-0000-4000-8000-000000000001',
    )
    expect(refocused.mentions[0].version).toBe(2)
  })
})
