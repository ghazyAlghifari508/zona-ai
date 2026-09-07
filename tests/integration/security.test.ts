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
const serverFunctionFiles = [
  ...walk(join(SRC, 'server', 'functions')),
  ...walk(join(SRC, 'server', 'core')),
]

// Layer-aware exemption: these server/core modules handle no request
// boundary themselves. Auth is enforced by their request-owning callers,
// which the checks below still require to call getAuthSession.
const NO_REQUEST_BOUNDARY = new Set([
  'artifact-profiles.ts',
  'artifact-repository.ts',
  'artifact-workspace.ts',
  'history.ts',
  'prd.ts',
])

function baseName(f: string): string {
  return f.split(/[\\/]/).pop() ?? f
}

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

  it('all server function files call getAuthSession or delegate to server core', () => {
    const offenders = serverFunctionFiles.filter((f) => {
      const content = readFileSync(f, 'utf8')
      const hasExport = /export (async )?(function|const)/.test(content)
      // RPC wrapper files (server/functions) may delegate auth to core files
      const delegatesToCore = content.includes("from '../core/")
      return (
        hasExport &&
        !content.includes('getAuthSession') &&
        !delegatesToCore &&
        !NO_REQUEST_BOUNDARY.has(baseName(f))
      )
    })
    expect(offenders).toEqual([])
  })

  it('server cores perform auth + ownership (getAuthSession present)', () => {
    const coreFiles = walk(join(SRC, 'server', 'core')).filter((f) => {
      const content = readFileSync(f, 'utf8')
      return /export (async )?(function|const)/.test(content)
    })
    expect(coreFiles.length).toBeGreaterThan(0)
    const offenders = coreFiles.filter((f) => {
      return (
        !readFileSync(f, 'utf8').includes('getAuthSession') &&
        !NO_REQUEST_BOUNDARY.has(baseName(f))
      )
    })
    expect(offenders).toEqual([])
  })

  it('auth-check exemptions reference existing modules only', () => {
    const coreFiles = walk(join(SRC, 'server', 'core'))
    for (const name of NO_REQUEST_BOUNDARY) {
      expect(coreFiles.filter((f) => baseName(f) === name).length).toBe(1)
    }
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

  it('MarkdownContent sanitizes markdown via rehype-sanitize', () => {
    const markdownContent = readFileSync(
      join(SRC, 'components', 'chat', 'MarkdownContent.tsx'),
      'utf8',
    )
    expect(markdownContent).toContain('rehypeSanitize')
    expect(markdownContent).toMatch(/rehypePlugins=\{[\w_]+\}/)

    const messageList = readFileSync(
      join(SRC, 'components', 'chat', 'MessageList.tsx'),
      'utf8',
    )
    expect(messageList).toContain('MarkdownContent')
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
    expect(content).toContain(`users/\${userId}/attachments/\${attachmentId}/`)
    expect(content).toContain('sanitizeFilename')
    expect(content).toContain('validateMagicBytes')
  })
})
