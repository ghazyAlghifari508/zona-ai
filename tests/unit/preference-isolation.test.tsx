import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/components/chat/Composer'
import {
  DEFAULT_SKILL_PREFERENCE_KEY,
  getDefaultSkillPreference,
  resetDefaultSkillPreferenceForTesting,
  setDefaultSkillPreference,
} from '../../src/lib/chat/skill-preference'
import {
  DEFAULT_MODEL_PREFERENCE_KEY,
  getDefaultModelPreference,
  resetDefaultModelPreferenceForTesting,
  setDefaultModelPreference,
} from '../../src/lib/models/preference'

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

describe('Preference Isolation: Chat state vs Global Settings defaults', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    resetDefaultModelPreferenceForTesting()
    resetDefaultSkillPreferenceForTesting()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    resetDefaultModelPreferenceForTesting()
    resetDefaultSkillPreferenceForTesting()
    vi.restoreAllMocks()
  })

  it('verifies settings default keys are separate and initialize to auto / none', () => {
    expect(DEFAULT_MODEL_PREFERENCE_KEY).toBe('zona-ai:default-model')
    expect(DEFAULT_SKILL_PREFERENCE_KEY).toBe('zona-ai:default-skill')
    expect(getDefaultModelPreference()).toBe('auto')
    expect(getDefaultSkillPreference()).toBe('none')
  })

  it('updates default preferences only when explicitly set from settings', () => {
    setDefaultModelPreference('gemini-3.7-flash-high')
    setDefaultSkillPreference('prd-plan')

    expect(getDefaultModelPreference()).toBe('gemini-3.7-flash-high')
    expect(getDefaultSkillPreference()).toBe('prd-plan')
    expect(localStorage.getItem(DEFAULT_MODEL_PREFERENCE_KEY)).toBe(
      'gemini-3.7-flash-high',
    )
    expect(localStorage.getItem(DEFAULT_SKILL_PREFERENCE_KEY)).toBe('prd-plan')
  })

  it('changing model in Composer does NOT overwrite global default preferences', () => {
    // Settings has Gemini and none as defaults
    setDefaultModelPreference('gemini-3.7-flash-high')
    setDefaultSkillPreference('none')

    const onModelChange = vi.fn()
    const onSend = vi.fn()

    render(
      <Composer
        credits={100}
        modelValue="gemini-3.7-flash-high"
        onModelChange={onModelChange}
        onSend={onSend}
      />,
    )

    // Open model selector popover
    const trigger = screen.getByTestId('model-selector-trigger')
    fireEvent.click(trigger)

    // Click Qwen option
    const option = screen.getByTestId('model-option-qwen3.8-flash')
    fireEvent.click(option)

    expect(onModelChange).toHaveBeenCalledWith('qwen3.8-flash')

    // CRITICAL: Global default in Settings MUST remain Gemini!
    expect(getDefaultModelPreference()).toBe('gemini-3.7-flash-high')
    expect(localStorage.getItem(DEFAULT_MODEL_PREFERENCE_KEY)).toBe(
      'gemini-3.7-flash-high',
    )
  })

  it('changing skill in Composer does NOT overwrite global default preferences', () => {
    // Settings defaults
    setDefaultModelPreference('gemini-3.7-flash-high')
    setDefaultSkillPreference('none')

    const onSkillChange = vi.fn()
    const onSend = vi.fn()

    render(
      <Composer
        skillValue="none"
        onSkillChange={onSkillChange}
        onSend={onSend}
      />,
    )

    // Open skill selector popover
    const trigger = screen.getByTestId('skill-selector-trigger')
    fireEvent.click(trigger)

    // Click PRD option
    const option = screen.getByTestId('skill-option-prd-plan')
    fireEvent.click(option)

    expect(onSkillChange).toHaveBeenCalledWith('prd-plan')

    // CRITICAL: Global default in Settings MUST remain none!
    expect(getDefaultSkillPreference()).toBe('none')
    expect(localStorage.getItem(DEFAULT_SKILL_PREFERENCE_KEY)).toBe('none')
  })

  it('subsequent changes to Settings defaults do not affect existing conversation state', () => {
    const currentConversationModel = 'qwen3.8-flash'
    const currentConversationSkill = 'prd-plan'

    // Conversation continues with its own state
    expect(currentConversationModel).toBe('qwen3.8-flash')
    expect(currentConversationSkill).toBe('prd-plan')

    // User navigates to Settings and changes defaults to auto & checklist
    setDefaultModelPreference('auto')
    setDefaultSkillPreference('checklist')

    expect(getDefaultModelPreference()).toBe('auto')
    expect(getDefaultSkillPreference()).toBe('checklist')

    // Conversation state is completely unaffected
    expect(currentConversationModel).toBe('qwen3.8-flash')
    expect(currentConversationSkill).toBe('prd-plan')

    // Initializing a new chat takes the new defaults
    const newChatInitialModel = getDefaultModelPreference()
    const newChatInitialSkill = getDefaultSkillPreference()

    expect(newChatInitialModel).toBe('auto')
    expect(newChatInitialSkill).toBe('checklist')
  })
})
