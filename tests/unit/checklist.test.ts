import { describe, expect, it } from 'vitest'
import {
  getChecklistCopyText,
  isStreamingChecklistPayload,
  looksLikeChecklistPayload,
  parseChecklist,
  parseLegacyChecklist,
  resolveChecklist,
  resolveChecklistDisplay,
} from '../../src/lib/chat/checklist'

describe('checklist structured schema', () => {
  it('parses a simple valid checklist payload', () => {
    const payload = {
      type: 'checklist',
      title: 'To-do hari ini',
      items: [
        { id: 'task-1', text: 'Mandi', completed: false },
        { id: 'task-2', text: 'Makan', completed: false },
        { id: 'task-3', text: 'Sholat', completed: false },
      ],
    }

    const result = parseChecklist(JSON.stringify(payload))

    expect(result).not.toBeNull()
    expect(result?.title).toBe('To-do hari ini')
    expect(result?.items).toHaveLength(3)
    expect(result?.items[0]).toEqual({
      id: 'task-1',
      text: 'Mandi',
      completed: false,
    })
  })

  it('accepts a fenced json block as the payload envelope', () => {
    const payload =
      '```json\n{"type":"checklist","items":[{"id":"task-1","text":"Cek waktu sholat terdekat","completed":false}]}\n```'

    const result = parseChecklist(payload)

    expect(result).not.toBeNull()
    expect(result?.items).toHaveLength(1)
    expect(result?.items[0].text).toBe('Cek waktu sholat terdekat')
  })

  it('keeps long task text and normalizes overlong text safely', () => {
    const longText = 'Siapkan kebutuhan puasa besok'.repeat(20)
    const payload = {
      type: 'checklist',
      items: [
        { id: 'task-1', text: longText, completed: false },
        { id: 'task-2', text: 'Mandi', completed: false },
      ],
    }

    const result = parseChecklist(JSON.stringify(payload))

    expect(result).not.toBeNull()
    expect(result?.items[0].text.length).toBeLessThanOrEqual(300)
    expect(result?.items[0].text).toContain('Siapkan kebutuhan puasa besok')
  })

  it('derives ids and defaults completed when model omits them', () => {
    const payload = {
      type: 'checklist',
      items: [{ text: 'Mandi' }, { text: 'Makan', completed: true }],
    }

    const result = parseChecklist(JSON.stringify(payload))

    expect(result).not.toBeNull()
    expect(result?.items[0].id).toBe('task-1')
    expect(result?.items[0].completed).toBe(false)
    expect(result?.items[1].completed).toBe(true)
  })

  it('drops invalid items but keeps valid ones', () => {
    const payload = {
      type: 'checklist',
      items: [
        { id: 'task-1', text: '   ', completed: false },
        { id: 'task-2', text: 'Makan', completed: false },
      ],
    }

    const result = parseChecklist(JSON.stringify(payload))

    expect(result).not.toBeNull()
    expect(result?.items).toHaveLength(1)
    expect(result?.items[0].id).toBe('task-2')
  })

  it('returns null for invalid json, wrong type, or empty items', () => {
    expect(parseChecklist('not json at all')).toBeNull()
    expect(
      parseChecklist(
        '{"type":"other","items":[{"id":"a","text":"b","completed":false}]}',
      ),
    ).toBeNull()
    expect(parseChecklist('{"type":"checklist","items":[]}')).toBeNull()
    expect(parseChecklist(null)).toBeNull()
    expect(parseChecklist(undefined)).toBeNull()
  })
})

describe('checklist legacy fallback parser', () => {
  it('parses old markdown task list responses into structured items', () => {
    const legacy = 'To-do hari ini\n\n- [ ] Mandi\n- [x] Makan\n- [ ] Sholat\n'

    const result = parseLegacyChecklist(legacy)

    expect(result).not.toBeNull()
    expect(result?.title).toBe('To-do hari ini')
    expect(result?.items).toEqual([
      { id: 'task-1', text: 'Mandi', completed: false },
      { id: 'task-2', text: 'Makan', completed: true },
      { id: 'task-3', text: 'Sholat', completed: false },
    ])
  })

  it('parses bare bracket lines without list markers', () => {
    const legacy = '[ ] Mandi\n[ ] Makan\n[X] Sholat\n'

    const result = parseLegacyChecklist(legacy)

    expect(result?.items).toEqual([
      { id: 'task-1', text: 'Mandi', completed: false },
      { id: 'task-2', text: 'Makan', completed: false },
      { id: 'task-3', text: 'Sholat', completed: true },
    ])
  })

  it('ignores prose that only mentions a single bracket line', () => {
    const prose =
      'Untuk format task, kamu bisa menulis seperti ini:\n\n- [ ] contoh task\n\nSemoga membantu!'

    expect(parseLegacyChecklist(prose)).toBeNull()
  })

  it('returns null for plain essay content', () => {
    const essay =
      'Puasa adalah ibadah menahan diri. Berikut penjelasan lengkapnya dalam beberapa paragraf agar kamu memahami konteksnya dengan baik.'

    expect(parseLegacyChecklist(essay)).toBeNull()
  })
})

describe('resolveChecklist precedence', () => {
  it('prefers structured payload over legacy markers', () => {
    const content =
      '```json\n{"type":"checklist","items":[{"id":"task-1","text":"Mandi","completed":false}]}\n```\n- [ ] Mandi\n- [x] Makan'

    const result = resolveChecklist(content)

    expect(result?.items).toHaveLength(1)
    expect(result?.items[0].id).toBe('task-1')
  })

  it('falls back to legacy markers when structured payload is invalid', () => {
    const content = '{"type":"checklist","items":[]}\n- [ ] Mandi\n- [x] Makan'

    const result = resolveChecklist(content)

    expect(result?.items).toHaveLength(2)
  })

  it('returns null for normal chat responses', () => {
    expect(resolveChecklist('Halo! Ada yang bisa saya bantu?')).toBeNull()
  })
})

describe('checklist streaming detection', () => {
  it('flags partial json payload as checklist-in-progress', () => {
    expect(
      looksLikeChecklistPayload('{"type":"checklist","items":[{"id":"'),
    ).toBe(true)
    expect(looksLikeChecklistPayload('```json\n{"type":"checklist","it')).toBe(
      true,
    )
  })

  it('does not flag normal prose or partial prose', () => {
    expect(looksLikeChecklistPayload('Berikut penjelasan singkatnya:')).toBe(
      false,
    )
    expect(looksLikeChecklistPayload('')).toBe(false)
    expect(looksLikeChecklistPayload(undefined)).toBe(false)
  })
})

describe('checklist in-flight payload detection', () => {
  it('detects an unclosed streaming payload as in-flight', () => {
    expect(isStreamingChecklistPayload('{"type":"checklist"')).toBe(true)
    expect(
      isStreamingChecklistPayload('```json\n{"type":"checklist","items":['),
    ).toBe(true)
  })

  it('does not treat a closed payload as in-flight', () => {
    const complete =
      '```json\n{"type":"checklist","items":[{"id":"task-1","text":"Mandi","completed":false}]}\n```'
    expect(isStreamingChecklistPayload(complete)).toBe(false)
    expect(
      isStreamingChecklistPayload(
        '{"type":"checklist","items":[{"id":"task-1","text":"Mandi","completed":false}]}',
      ),
    ).toBe(false)
  })

  it('never flags prose or empty content as in-flight payload', () => {
    expect(isStreamingChecklistPayload('Berikut penjelasannya')).toBe(false)
    expect(isStreamingChecklistPayload('')).toBe(false)
    expect(isStreamingChecklistPayload(null)).toBe(false)
  })
})

describe('checklist display resolution during streaming', () => {
  const completePayload =
    '{"type":"checklist","items":[{"id":"task-1","text":"Mandi","completed":false},{"id":"task-2","text":"Makan","completed":false}]}'

  it('returns pending for partial payload while streaming', () => {
    const display = resolveChecklistDisplay(
      '{"type":"checklist","items":[',
      true,
    )
    expect(display?.status).toBe('pending')
  })

  it('returns ready for a complete payload even while still streaming', () => {
    const display = resolveChecklistDisplay(completePayload, true)
    expect(display?.status).toBe('ready')
    if (display?.status === 'ready') {
      expect(display.checklist.items).toHaveLength(2)
    }
  })

  it('returns ready for completed non-streaming legacy content', () => {
    const display = resolveChecklistDisplay('- [ ] Mandi\n- [x] Makan', false)
    expect(display?.status).toBe('ready')
    if (display?.status === 'ready') {
      expect(display.checklist.items[1].completed).toBe(true)
    }
  })

  it('returns null for normal prose in any state', () => {
    expect(
      resolveChecklistDisplay('Jawaban normal tanpa checklist', true),
    ).toBeNull()
    expect(
      resolveChecklistDisplay('Jawaban normal tanpa checklist', false),
    ).toBeNull()
  })

  it('returns null instead of raw fallback when finished payload is invalid', () => {
    expect(
      resolveChecklistDisplay('{"type":"checklist","items":[]}', false),
    ).toBeNull()
  })
})

describe('checklist copy text', () => {
  it('renders human readable task list with completed markers', () => {
    const checklist = {
      type: 'checklist' as const,
      title: 'To-do hari ini',
      items: [
        { id: 'task-1', text: 'Mandi', completed: false },
        { id: 'task-2', text: 'Makan', completed: true },
      ],
    }

    const text = getChecklistCopyText(checklist)

    expect(text).toContain('To-do hari ini')
    expect(text).toContain('- [ ] Mandi')
    expect(text).toContain('- [x] Makan')
  })
})
