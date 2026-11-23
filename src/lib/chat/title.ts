import { streamText } from 'ai'
import { resolveTitleModel } from '../../server/core/model-catalog'
import { nineRouter } from '../ai/9router'
import { CONVERSATION_TITLE_MAX_LENGTH } from '../utils/constants'

const TITLE_SYSTEM = [
  'You generate the short title shown for a chat conversation in the sidebar.',
  'Reply with ONLY the title text: 4 to 6 words maximum.',
  'Never answer the question itself; just a concise topic label.',
  'No quotes, no markdown, no punctuation at the end, no numbering.',
  'Use the same language as the conversation.',
].join(' ')

export async function generateAiTitle(input: {
  prompt: string
}): Promise<string | null> {
  const routerModelId = await resolveTitleModel()
  if (!routerModelId) return null
  try {
    const result = streamText({
      model: nineRouter(routerModelId),
      system: TITLE_SYSTEM,
      prompt: `Pesan pengguna:\n${input.prompt.slice(0, 800)}`,
      maxOutputTokens: 48,
      abortSignal: AbortSignal.timeout(10_000),
    })
    const text = await result.text
    const title = text
      .trim()
      .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) return null
    if (title.length <= CONVERSATION_TITLE_MAX_LENGTH) return title
    return `${title.slice(0, CONVERSATION_TITLE_MAX_LENGTH - 1).trimEnd()}…`
  } catch {
    return null
  }
}
