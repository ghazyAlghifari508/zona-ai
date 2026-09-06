import dart from 'highlight.js/lib/languages/dart'
import { common } from 'lowlight'
import { isValidElement, type ReactNode } from 'react'
import type { Options as RehypeHighlightOptions } from 'rehype-highlight'

export const chatHighlightOptions: RehypeHighlightOptions = {
  languages: {
    ...common,
    dart,
  },
  detect: false,
}

export function extractRawText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractRawText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractRawText(node.props.children)
  }
  return ''
}
