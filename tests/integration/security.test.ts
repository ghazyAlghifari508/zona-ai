/**
 * @vitest-environment node
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '../../src')

function walk(dir: string, exts: string[] = ['.ts', '.tsx']): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      out.push(...walk(full, exts))
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full)
    }
  }
  return out
}

const allSrcFiles = walk(SRC)
const componentFiles = allSrcFiles.filter((f) =>
  f.includes(join('src', 'components')),
)
const serverFunctionFiles = walk(join(SRC, 'server', 'functions'))

describe('security audit — static checks (SECURITY.md 20 sections)', () => {
  it('no dangerouslySetInnerHTML anywhere in src/components', () => {
    const offenders = componentFiles.filter((f) =>
      readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'),
    )
    expect(offenders).toEqual([])
  })

  it('no server-only secret clients imported from components', () => {
    const offenders = componentFiles.filter((f) => {
      const content = readFileSync(f, 'utf8')
      return (
        content.includes('r2/client') ||
        content.includes('tavily/client') ||
        content.includes('langfuse') ||
        content.includes('9router')
      )
    })
    expect(offenders).toEqual([])
  })

  it('no secret env names referenced in components', () => {
    const secrets = [
      'NINE_ROUTER_API_KEY',
      'TAVILY_API_KEY',
      'R2_SECRET_ACCESS_KEY',
      'LANGFUSE_SECRET_KEY',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
    ]
    const offenders = componentFiles.filter((f) => {
      const content = readFileSync(f, 'utf8')
      return secrets.some((s) => content.includes(s))
    })
    expect(offenders).toEqual([])
  })

  it('all server function files call getAuthSession', () => {
    const offenders = serverFunctionFiles.filter((f) => {
      const content = readFileSync(f, 'utf8')
      // files that only export types or are empty are exempt; every real module must auth
      const hasExport = /export (async )?(function|const)/.test(content)
      return hasExport && !content.includes('getAuthSession')
    })
    expect(offenders).toEqual([])
  })

  it('conversation queries verify userId ownership (where + userId)', () => {
    for (const f of serverFunctionFiles) {
      const content = readFileSync(f, 'utf8')
      // every file touching conversations must also reference userId ownership
      if (content.includes('from(conversations)')) {
        expect(content).toMatch(/userId/)
      }
    }
  })

  it('MessageList sanitizes markdown via rehype-sanitize', () => {
    const content = readFileSync(
      join(SRC, 'components', 'chat', 'MessageList.tsx'),
      'utf8',
    )
    expect(content).toContain('rehypeSanitize')
    expect(content).toMatch(/rehypePlugins=\{\[rehypeSanitize/)
  })

  it('no eval usage in src', () => {
    const offenders = allSrcFiles.filter((f) =>
      readFileSync(f, 'utf8').match(/\beval\s*\(/),
    )
    expect(offenders).toEqual([])
  })

  it('R2 object keys follow users/{userId}/attachments/{uuid} pattern', () => {
    const content = readFileSync(
      join(SRC, 'server', 'functions', 'files.ts'),
      'utf8',
    )
    expect(content).toContain('users/${userId}/attachments/${')
    expect(content).toContain('sanitizeFilename')
    expect(content).toContain('validateMagicBytes')
  })
})
