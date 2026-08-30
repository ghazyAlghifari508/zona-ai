/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return { ...actual, streamText: vi.fn() }
})

import { streamText } from 'ai'
import { generateAiTitle } from '../../src/lib/chat/title'
import { modelRegistry } from '../../src/lib/models/registry'

type StreamTextResult = ReturnType<typeof streamText>

// cast boundary: AI SDK StreamTextResult mock — `.text` is consumed by generateAiTitle
const mockStream = (text: string) =>
  ({ text: Promise.resolve(text) }) as unknown as StreamTextResult

const mockStreamError = (message: string) =>
  ({ text: Promise.reject(new Error(message)) }) as unknown as StreamTextResult

const mockedStreamText = vi.mocked(streamText)

const lightweightRouterModelId = modelRegistry.find((m) => m.id === 'auto')
  ?.routingRules?.lightweight

beforeEach(() => {
  mockedStreamText.mockReset()
})

describe('generateAiTitle', () => {
  it('returns a cleaned single-line title from model output', async () => {
    mockedStreamText.mockReturnValueOnce(
      mockStream('"Harga kopi naik lagi"\n\n'),
    )
    const title = await generateAiTitle({ prompt: 'p' })
    expect(title).toBe('Harga kopi naik lagi')
  })

  it('caps the title at the max conversation title length with ellipsis', async () => {
    mockedStreamText.mockReturnValueOnce(mockStream('x'.repeat(140)))
    const title = await generateAiTitle({ prompt: 'p' })
    expect(title).toHaveLength(100)
    expect(title?.endsWith('…')).toBe(true)
  })

  it('returns null when model output has no usable text', async () => {
    mockedStreamText.mockReturnValueOnce(mockStream('  \n " " \n'))
    const title = await generateAiTitle({ prompt: 'p' })
    expect(title).toBeNull()
  })

  it('returns null when the AI call fails', async () => {
    mockedStreamText.mockReturnValueOnce(mockStreamError('router down'))
    const title = await generateAiTitle({ prompt: 'p' })
    expect(title).toBeNull()
  })

  it('routes through the registry lightweight model and includes the prompt', async () => {
    mockedStreamText.mockReturnValueOnce(mockStream('Judul'))
    await generateAiTitle({
      prompt: 'pertanyaan-sintetis-123',
    })
    expect(mockedStreamText).toHaveBeenCalledTimes(1)
    const call = mockedStreamText.mock.calls[0][0]
    expect(lightweightRouterModelId).toBeTruthy()
    expect(call.model).toHaveProperty('modelId', lightweightRouterModelId)
    expect(String(call.prompt)).toContain('pertanyaan-sintetis-123')
  })
})
