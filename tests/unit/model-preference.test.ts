import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getSelectedModelPreference,
  setSelectedModelPreference,
  resetModelPreferenceForTesting,
  useSelectedModel,
  resolveModelFallback,
  MODEL_PREFERENCE_KEY,
} from '../../src/lib/models/preference'

describe('model preference store', () => {
  beforeEach(() => {
    localStorage.clear()
    resetModelPreferenceForTesting()
  })

  afterEach(() => {
    localStorage.clear()
    resetModelPreferenceForTesting()
  })

  it('defaults to auto when no preference is stored', () => {
    expect(getSelectedModelPreference()).toBe('auto')
  })

  it('updates preference in memory and persists to localStorage', () => {
    setSelectedModelPreference('gemini-3.7-flash-high')
    expect(getSelectedModelPreference()).toBe('gemini-3.7-flash-high')
    expect(localStorage.getItem(MODEL_PREFERENCE_KEY)).toBe('gemini-3.7-flash-high')
  })

  it('hydrates saved preference from localStorage on fresh initialization', () => {
    localStorage.setItem(MODEL_PREFERENCE_KEY, 'cx/gpt-5.6-sol')
    resetModelPreferenceForTesting()

    expect(getSelectedModelPreference()).toBe('cx/gpt-5.6-sol')
    const { result } = renderHook(() => useSelectedModel())
    expect(result.current[0]).toBe('cx/gpt-5.6-sol')
  })

  it('synchronizes state across multiple useSelectedModel hook instances', () => {
    const { result: hookA } = renderHook(() => useSelectedModel())
    const { result: hookB } = renderHook(() => useSelectedModel())

    expect(hookA.current[0]).toBe('auto')
    expect(hookB.current[0]).toBe('auto')

    act(() => {
      hookA.current[1]('gpt-4o')
    })

    expect(hookA.current[0]).toBe('gpt-4o')
    expect(hookB.current[0]).toBe('gpt-4o')
    expect(getSelectedModelPreference()).toBe('gpt-4o')
  })

  it('preserves preference across unmount and remount (simulating conversation change)', () => {
    const { result, unmount } = renderHook(() => useSelectedModel())

    act(() => {
      result.current[1]('gemini-3.7-flash-high')
    })
    expect(result.current[0]).toBe('gemini-3.7-flash-high')

    // Simulate navigation to another conversation or new chat (component unmount)
    unmount()

    // New conversation mounts
    const { result: newMount } = renderHook(() => useSelectedModel())
    expect(newMount.current[0]).toBe('gemini-3.7-flash-high')
  })

  it('persists when user switches to a different model explicitly', () => {
    const { result } = renderHook(() => useSelectedModel())

    act(() => {
      result.current[1]('gemini-3.7-flash-high')
    })
    expect(result.current[0]).toBe('gemini-3.7-flash-high')

    act(() => {
      result.current[1]('cx/gpt-5.6-sol')
    })
    expect(result.current[0]).toBe('cx/gpt-5.6-sol')
    expect(localStorage.getItem(MODEL_PREFERENCE_KEY)).toBe('cx/gpt-5.6-sol')
  })

  it('falls back to auto only when catalog is loaded and model is missing or disabled, never mutating the stored preference', () => {
    const mockCatalog = [
      { id: 'auto', enabled: true },
      { id: 'gemini-3.7-flash-high', enabled: true },
      { id: 'deprecated-model', enabled: false },
    ]

    // Valid model in catalog
    expect(resolveModelFallback(mockCatalog, 'gemini-3.7-flash-high')).toBe(
      'gemini-3.7-flash-high',
    )

    // Missing model falls back to auto WITHOUT touching stored preference
    setSelectedModelPreference('gemini-3.7-flash-high')
    expect(resolveModelFallback(mockCatalog, 'non-existent-model')).toBe('auto')
    expect(getSelectedModelPreference()).toBe('gemini-3.7-flash-high')

    // Disabled model falls back to auto WITHOUT touching stored preference
    setSelectedModelPreference('deprecated-model')
    expect(resolveModelFallback(mockCatalog, 'deprecated-model')).toBe('auto')
    expect(getSelectedModelPreference()).toBe('deprecated-model')

    // Empty catalog (still loading) must not prematurely fall back
    setSelectedModelPreference('gemini-3.7-flash-high')
    expect(resolveModelFallback([], 'gemini-3.7-flash-high')).toBe(
      'gemini-3.7-flash-high',
    )
    expect(getSelectedModelPreference()).toBe('gemini-3.7-flash-high')
  })
})
