import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Composer } from '../../src/components/chat/Composer'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    {
      id: 'auto',
      displayName: 'Auto (Smart Router)',
      vendor: 'ZonaAI',
      provider: 'openai',
      creditCost: 1,
      creditTier: 'standard',
      intelligenceLevel: 3,
      capabilities: { vision: true },
    },
    {
      id: 'gemini-3.7-flash-high',
      displayName: 'Gemini 3.7 Flash',
      vendor: 'Google',
      provider: 'google',
      creditCost: 1,
      creditTier: 'standard',
      intelligenceLevel: 3,
      capabilities: { vision: true },
    },
    {
      id: 'qwen3.8-flash',
      displayName: 'Qwen 3.8 Flash',
      vendor: 'Alibaba',
      provider: 'qwen',
      creditCost: 1,
      creditTier: 'standard',
      intelligenceLevel: 3,
      capabilities: { vision: true },
    },
  ],
  findCatalogEntry: (
    catalog: Array<{ id: string; displayName: string }>,
    id: string,
  ) =>
    catalog.find((m) => m.id === id) ?? {
      id,
      displayName: id,
    },
}))

describe('Composer draft preservation', () => {
  afterEach(cleanup)

  it('preserves draft prompt across multiple configuration changes (model, skill, compare mode)', async () => {
    const onModelChange = vi.fn()
    function FullControlledHarness() {
      const [model, setModel] = useState('auto')
      const [skill, setSkill] = useState('none')
      const [compareEnabled, setCompareEnabled] = useState(false)
      const [compareModelIds, setCompareModelIds] = useState<string[]>([])

      return (
        <Composer
          credits={100}
          modelValue={model}
          onModelChange={(next) => {
            onModelChange(next)
            setModel(next)
          }}
          skillValue={skill}
          onSkillChange={setSkill}
          compareEnabled={compareEnabled}
          onCompareEnabledChange={setCompareEnabled}
          compareModelIds={compareModelIds}
          onCompareModelIdsChange={setCompareModelIds}
          onSend={vi.fn()}
        />
      )
    }

    render(<FullControlledHarness />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    const longPrompt =
      'Prompt panjang yang sangat berharga dan tidak boleh hilang saat konfigurasi berubah...'
    fireEvent.change(textarea, { target: { value: longPrompt } })
    expect(textarea.value).toBe(longPrompt)

    // 1. Change model to gemini
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(
        screen.getByTestId('model-option-gemini-3.7-flash-high'),
      ).toBeTruthy()
    })
    const opt = screen.getByTestId('model-option-gemini-3.7-flash-high')
    fireEvent.click(opt)
    expect(onModelChange).toHaveBeenCalledWith('gemini-3.7-flash-high')
    expect(textarea.value).toBe(longPrompt)

    // 2. Change model to qwen
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('model-option-qwen3.8-flash')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('model-option-qwen3.8-flash'))
    expect(textarea.value).toBe(longPrompt)

    // 3. Change skill
    fireEvent.click(screen.getByTestId('skill-selector-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('skill-option-checklist')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('skill-option-checklist'))
    expect(textarea.value).toBe(longPrompt)

    // 4. Toggle compare mode
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('compare-switch')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compare-switch'))
    expect(textarea.value).toBe(longPrompt)

    // 5. Add model to compare
    if (!screen.queryByTestId('model-option-gemini-3.7-flash-high')) {
      fireEvent.click(screen.getByTestId('model-selector-trigger'))
      await waitFor(() => {
        expect(
          screen.getByTestId('model-option-gemini-3.7-flash-high'),
        ).toBeTruthy()
      })
    }
    fireEvent.click(screen.getByTestId('model-option-gemini-3.7-flash-high'))
    expect(textarea.value).toBe(longPrompt)

    // 6. Add another model to compare
    if (!screen.queryByTestId('model-option-qwen3.8-flash')) {
      fireEvent.click(screen.getByTestId('model-selector-trigger'))
      await waitFor(() => {
        expect(screen.getByTestId('model-option-qwen3.8-flash')).toBeTruthy()
      })
    }
    fireEvent.click(screen.getByTestId('model-option-qwen3.8-flash'))
    expect(textarea.value).toBe(longPrompt)

    // 7. Remove model from compare
    if (!screen.queryByTestId('model-option-gemini-3.7-flash-high')) {
      fireEvent.click(screen.getByTestId('model-selector-trigger'))
      await waitFor(() => {
        expect(
          screen.getByTestId('model-option-gemini-3.7-flash-high'),
        ).toBeTruthy()
      })
    }
    fireEvent.click(screen.getByTestId('model-option-gemini-3.7-flash-high'))
    expect(textarea.value).toBe(longPrompt)

    // 8. Toggle compare mode off
    if (!screen.queryByTestId('compare-switch')) {
      fireEvent.click(screen.getByTestId('model-selector-trigger'))
      await waitFor(() => {
        expect(screen.getByTestId('compare-switch')).toBeTruthy()
      })
    }
    fireEvent.click(screen.getByTestId('compare-switch'))
    expect(textarea.value).toBe(longPrompt)
  })

  it('preserves draft prompt across configuration changes in uncontrolled mode', async () => {
    render(<Composer credits={100} onSend={vi.fn()} />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    const userPrompt = 'Draft prompt penting dalam mode uncontrolled...'
    fireEvent.change(textarea, { target: { value: userPrompt } })
    expect(textarea.value).toBe(userPrompt)

    // Change model
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(
        screen.getByTestId('model-option-gemini-3.7-flash-high'),
      ).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('model-option-gemini-3.7-flash-high'))
    expect(textarea.value).toBe(userPrompt)

    // Change skill
    fireEvent.click(screen.getByTestId('skill-selector-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('skill-option-checklist')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('skill-option-checklist'))
    expect(textarea.value).toBe(userPrompt)
  })

  it('landing page flow: syncs parent draft via onDraftChange and retains draft when model changes', async () => {
    function LandingPageHarness() {
      const [draft, setDraft] = useState('')
      const [selectedModel, setSelectedModel] = useState('auto')
      const [selectedSkill, setSelectedSkill] = useState('none')
      const [composerKey, setComposerKey] = useState(0)

      return (
        <div>
          <button
            type="button"
            data-testid="starter-btn"
            onClick={() => {
              setDraft('Starter prompt template')
              setComposerKey((k) => k + 1)
            }}
          >
            Starter
          </button>
          <button
            type="button"
            data-testid="new-chat-btn"
            onClick={() => {
              setDraft('')
              setSelectedModel('auto')
              setSelectedSkill('none')
              setComposerKey((k) => k + 1)
            }}
          >
            New Chat
          </button>
          <div data-testid="parent-draft-display">{draft}</div>
          <Composer
            key={composerKey}
            credits={100}
            initialContent={draft}
            onDraftChange={setDraft}
            modelValue={selectedModel}
            onModelChange={setSelectedModel}
            skillValue={selectedSkill}
            onSkillChange={setSelectedSkill}
            onSend={vi.fn()}
          />
        </div>
      )
    }

    render(<LandingPageHarness />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    const typedText = 'Pertanyaan panjang buatan user dari landing page'
    fireEvent.change(textarea, { target: { value: typedText } })

    // Verify parent draft state is updated in real time
    expect(screen.getByTestId('parent-draft-display').textContent).toBe(typedText)
    expect(textarea.value).toBe(typedText)

    // Change model - draft MUST NOT be cleared
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(
        screen.getByTestId('model-option-gemini-3.7-flash-high'),
      ).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('model-option-gemini-3.7-flash-high'))

    expect(textarea.value).toBe(typedText)
    expect(screen.getByTestId('parent-draft-display').textContent).toBe(typedText)

    // Starter button resets draft to starter prompt
    fireEvent.click(screen.getByTestId('starter-btn'))
    const updatedTextarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    expect(updatedTextarea.value).toBe('Starter prompt template')

    // New chat button resets draft to empty
    fireEvent.click(screen.getByTestId('new-chat-btn'))
    const resetTextarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    expect(resetTextarea.value).toBe('')
  })

  it('protects user-typed draft prompt when parent initialContent changes asynchronously', async () => {
    function AsyncInitialContentHarness() {
      const [initial, setInitial] = useState('')

      return (
        <div>
          <button
            type="button"
            data-testid="simulate-async-guest-draft"
            onClick={() => setInitial('Late guest draft from storage')}
          >
            Load
          </button>
          <Composer credits={100} initialContent={initial} onSend={vi.fn()} />
        </div>
      )
    }

    render(<AsyncInitialContentHarness />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    const userPrompt = 'User sudah mengetik prompt panjang sebelum storage siap'
    fireEvent.change(textarea, { target: { value: userPrompt } })
    expect(textarea.value).toBe(userPrompt)

    // Simulate async storage returning a different initialContent
    fireEvent.click(screen.getByTestId('simulate-async-guest-draft'))

    // The user's typed prompt MUST be preserved, not overwritten!
    expect(textarea.value).toBe(userPrompt)
  })

  it('clears draft when message is successfully sent', () => {
    const onSend = vi.fn()
    render(<Composer credits={100} onSend={onSend} />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Pesan yang akan dikirim' } })
    expect(textarea.value).toBe('Pesan yang akan dikirim')

    fireEvent.click(screen.getByTestId('send-button'))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(textarea.value).toBe('')
  })

  it('clears draft when user manually deletes the text', () => {
    render(<Composer credits={100} onSend={vi.fn()} />)

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Teks awal' } })
    expect(textarea.value).toBe('Teks awal')

    fireEvent.change(textarea, { target: { value: '' } })
    expect(textarea.value).toBe('')
  })
})
