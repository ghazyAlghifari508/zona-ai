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
  'artifact-catalog-context.ts',
  'artifact-finalization.ts',
  'artifact-mentions.ts',
  'artifact-operations.ts',
  'artifact-profiles.ts',
  'artifact-repository.ts',
  'artifact-workspace.ts',
  'history.ts',
  'inference-model.ts',
  'model-catalog.ts',
  'prd.ts',
])

const ARTIFACT_PLANNER = 'artifact-operations.ts'
const ARTIFACT_PLANNER_CALLER = 'artifact-generation.ts'

// The installed TypeScript 7 compiler no longer exposes a stable JS parsing
// API (its entry exports only version metadata), so this audit tokenizes
// sources directly. Comments and string literals never produce code tokens,
// so lookalike text inside them cannot register as a call or an import.
type PlannerName = 'planArtifactOperations' | 'planCompareArtifactOperations'

type PlannerCall = {
  callerFunction: string | undefined
  file: string
  planner: PlannerName
}

type Token = {
  end: number
  kind: 'ident' | 'punct' | 'string'
  start: number
  value: string
}

type Span = {
  end: number
  start: number
}

type ImportMaps = {
  authBare: Set<string>
  authNamespaces: Set<string>
  plannerBare: Map<string, PlannerName>
  plannerNamespaces: Set<string>
  ranges: Span[]
}

type ScannedCall = {
  enclosing: string | undefined
  nameIndex: number
  openParen: number
  planner: PlannerName
}

type ScopeFrame =
  | { kind: 'block' }
  | { concise: false; kind: 'func'; name: string | undefined }
  | {
      brackets: number
      braces: number
      concise: true
      kind: 'func'
      name: string | undefined
      parens: number
      start: number
    }

function baseName(f: string): string {
  return f.split(/[\\/]/).pop() ?? f
}

function isPlannerName(value: string): value is PlannerName {
  return (
    value === 'planArtifactOperations' ||
    value === 'planCompareArtifactOperations'
  )
}

function at(tokens: Token[], index: number): Token | undefined {
  if (index < 0 || index >= tokens.length) return undefined
  const token: Token | undefined = tokens[index]
  return token
}

function isIdentStart(code: number): boolean {
  return (
    code === 36 ||
    code === 95 ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || (code >= 48 && code <= 57)
}

function isWhitespace(char: string): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\r' ||
    char === '\f' ||
    char === '\v'
  )
}

function tokenize(content: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  const length = content.length

  function push(kind: Token['kind'], start: number, end: number): void {
    tokens.push({ end, kind, start, value: content.slice(start, end) })
  }

  function skipLineComment(): void {
    while (index < length && content[index] !== '\n') index += 1
  }

  function skipBlockComment(): void {
    index += 2
    while (index < length) {
      if (content[index] === '*' && content[index + 1] === '/') {
        index += 2
        return
      }
      index += 1
    }
  }

  function readQuoted(): void {
    const start = index
    const quote = content[index]
    index += 1
    while (index < length) {
      const char = content[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === quote) {
        index += 1
        break
      }
      if (char === '\n') break
      index += 1
    }
    push('string', start, index)
  }

  function readTemplate(): void {
    index += 1
    let segmentStart = index
    while (index < length) {
      const char = content[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '`') {
        if (index > segmentStart) push('string', segmentStart, index)
        index += 1
        return
      }
      if (char === '$' && content[index + 1] === '{') {
        if (index > segmentStart) push('string', segmentStart, index)
        push('punct', index, index + 2)
        index += 2
        readCode(true)
        segmentStart = index
        continue
      }
      index += 1
    }
    if (index > segmentStart) push('string', segmentStart, index)
  }

  function readCode(stopAtBrace: boolean): void {
    let depth = 0
    while (index < length) {
      const char = content[index]
      if (char === undefined) break
      if (isWhitespace(char)) {
        index += 1
        continue
      }
      if (char === '/' && content[index + 1] === '/') {
        skipLineComment()
        continue
      }
      if (char === '/' && content[index + 1] === '*') {
        skipBlockComment()
        continue
      }
      if (char === "'" || char === '"') {
        readQuoted()
        continue
      }
      if (char === '`') {
        readTemplate()
        continue
      }
      if (char === '{') {
        depth += 1
        push('punct', index, index + 1)
        index += 1
        continue
      }
      if (char === '}') {
        if (stopAtBrace && depth === 0) {
          push('punct', index, index + 1)
          index += 1
          return
        }
        if (depth > 0) depth -= 1
        push('punct', index, index + 1)
        index += 1
        continue
      }
      const code = content.charCodeAt(index)
      if (isIdentStart(code)) {
        const start = index
        index += 1
        while (index < length && isIdentPart(content.charCodeAt(index)))
          index += 1
        push('ident', start, index)
        continue
      }
      if (code >= 48 && code <= 57) {
        const start = index
        index += 1
        while (index < length) {
          const next = content.charCodeAt(index)
          if (!isIdentPart(next) && next !== 46) break
          index += 1
        }
        push('punct', start, index)
        continue
      }
      const three = content.slice(index, index + 3)
      if (three === '...' || three === '===' || three === '!==') {
        push('punct', index, index + 3)
        index += 3
        continue
      }
      const two = content.slice(index, index + 2)
      if (
        two === '=>' ||
        two === '?.' ||
        two === '??' ||
        two === '==' ||
        two === '!=' ||
        two === '<=' ||
        two === '>=' ||
        two === '&&' ||
        two === '||' ||
        two === '**' ||
        two === '<<' ||
        two === '>>' ||
        two === '+=' ||
        two === '-=' ||
        two === '*=' ||
        two === '/=' ||
        two === '%=' ||
        two === '&=' ||
        two === '|='
      ) {
        push('punct', index, index + 2)
        index += 2
        continue
      }
      push('punct', index, index + 1)
      index += 1
    }
  }

  readCode(false)
  return tokens
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === "'" || first === '"' || first === '`') && first === last)
      return value.slice(1, -1)
  }
  return value
}

function matchForward(
  tokens: Token[],
  open: number,
  openValue: string,
  closeValue: string,
): number | undefined {
  let depth = 0
  for (let i = open; i < tokens.length; i += 1) {
    const token = at(tokens, i)
    if (token === undefined || token.kind !== 'punct') continue
    if (
      token.value === openValue ||
      (openValue === '{' && token.value === '${')
    )
      depth += 1
    else if (token.value === closeValue) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return undefined
}

function matchBackward(
  tokens: Token[],
  close: number,
  openValue: string,
  closeValue: string,
): number | undefined {
  let depth = 0
  for (let i = close; i >= 0; i -= 1) {
    const token = at(tokens, i)
    if (token === undefined || token.kind !== 'punct') continue
    if (token.value === closeValue) depth += 1
    else if (token.value === openValue) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return undefined
}

function inRanges(index: number, ranges: Span[]): boolean {
  return ranges.some((range) => index >= range.start && index <= range.end)
}

function parseImportMaps(tokens: Token[]): ImportMaps {
  const maps: ImportMaps = {
    authBare: new Set(),
    authNamespaces: new Set(),
    plannerBare: new Map(),
    plannerNamespaces: new Set(),
    ranges: [],
  }
  let i = 0
  while (i < tokens.length) {
    const token = at(tokens, i)
    if (
      token === undefined ||
      token.kind !== 'ident' ||
      token.value !== 'import'
    ) {
      i += 1
      continue
    }
    i = parseImportStatement(tokens, i, maps)
  }
  return maps
}

function parseImportStatement(
  tokens: Token[],
  from: number,
  maps: ImportMaps,
): number {
  let i = from + 1
  const first = at(tokens, i)
  if (first === undefined) return i
  if (first.kind === 'string') {
    maps.ranges.push({ end: i, start: from })
    return i + 1
  }
  if (first.kind === 'ident' && first.value === 'type') {
    let j = i + 1
    while (j < tokens.length) {
      if (at(tokens, j)?.kind === 'string') {
        maps.ranges.push({ end: j, start: from })
        return j + 1
      }
      j += 1
    }
    return j
  }
  const bare: Array<{ local: string; original: string }> = []
  let namespace: string | undefined
  const maybeDefault = at(tokens, i)
  const afterDefault = at(tokens, i + 1)
  if (
    maybeDefault !== undefined &&
    maybeDefault.kind === 'ident' &&
    afterDefault !== undefined &&
    (afterDefault.value === ',' || afterDefault.value === 'from')
  ) {
    i += 1
    if (at(tokens, i)?.value === ',') i += 1
  }
  const bindings = at(tokens, i)
  if (bindings !== undefined && bindings.value === '*') {
    const nameToken = at(tokens, i + 2)
    if (
      at(tokens, i + 1)?.value === 'as' &&
      nameToken !== undefined &&
      nameToken.kind === 'ident'
    ) {
      namespace = nameToken.value
      i += 3
    }
  } else if (bindings !== undefined && bindings.value === '{') {
    const close = matchForward(tokens, i, '{', '}')
    if (close === undefined) return tokens.length
    let j = i + 1
    while (j < close) {
      const entry = at(tokens, j)
      if (entry === undefined) break
      if (entry.value === ',') {
        j += 1
        continue
      }
      if (entry.kind !== 'ident') {
        j += 1
        continue
      }
      if (entry.value === 'type') {
        const named = at(tokens, j + 1)
        if (named !== undefined && named.kind === 'ident') {
          j += at(tokens, j + 2)?.value === 'as' ? 4 : 2
          continue
        }
        j += 1
        continue
      }
      const original = entry.value
      let local = original
      if (at(tokens, j + 1)?.value === 'as') {
        const localToken = at(tokens, j + 2)
        if (localToken === undefined || localToken.kind !== 'ident') break
        local = localToken.value
        j += 3
      } else {
        j += 1
      }
      bare.push({ local, original })
    }
    i = close + 1
  }
  if (at(tokens, i)?.value !== 'from' || at(tokens, i + 1)?.kind !== 'string')
    return i + 1
  const specToken = at(tokens, i + 1)
  if (specToken === undefined) return i + 1
  const specifier = stripQuotes(specToken.value)
  maps.ranges.push({ end: i + 1, start: from })
  if (specifier.endsWith('artifact-operations')) {
    for (const entry of bare) {
      if (isPlannerName(entry.original))
        maps.plannerBare.set(entry.local, entry.original)
    }
    if (namespace !== undefined) maps.plannerNamespaces.add(namespace)
  } else if (specifier.endsWith('lib/auth/session')) {
    for (const entry of bare) {
      if (entry.original === 'getAuthSession') maps.authBare.add(entry.local)
    }
    if (namespace !== undefined) maps.authNamespaces.add(namespace)
  }
  return i + 2
}

function isControlKeyword(value: string): boolean {
  return (
    value === 'if' ||
    value === 'for' ||
    value === 'while' ||
    value === 'switch' ||
    value === 'catch' ||
    value === 'with' ||
    value === 'return'
  )
}

function isCallShaped(tokens: Token[], openParen: number): boolean {
  const close = matchForward(tokens, openParen, '(', ')')
  if (close === undefined) return false
  return at(tokens, close + 1)?.value !== '{'
}

function resolveCall(
  tokens: Token[],
  from: number,
  maps: ImportMaps,
): ScannedCall | undefined {
  const head = at(tokens, from)
  if (head === undefined || head.kind !== 'ident') return undefined
  const dot = at(tokens, from + 1)
  if (dot !== undefined && (dot.value === '.' || dot.value === '?.')) {
    const member = at(tokens, from + 2)
    const paren = at(tokens, from + 3)
    if (
      member !== undefined &&
      member.kind === 'ident' &&
      isPlannerName(member.value) &&
      paren !== undefined &&
      paren.value === '('
    )
      return {
        enclosing: undefined,
        nameIndex: from,
        openParen: from + 3,
        planner: member.value,
      }
    return undefined
  }
  if (dot === undefined || dot.value !== '(') return undefined
  if (inRanges(from, maps.ranges)) return undefined
  const prev = at(tokens, from - 1)?.value
  if (prev === 'function' || prev === '.' || prev === '?.') return undefined
  const mapped = maps.plannerBare.get(head.value)
  if (mapped !== undefined && isCallShaped(tokens, from + 1))
    return {
      enclosing: undefined,
      nameIndex: from,
      openParen: from + 1,
      planner: mapped,
    }
  if (isPlannerName(head.value) && isCallShaped(tokens, from + 1))
    return {
      enclosing: undefined,
      nameIndex: from,
      openParen: from + 1,
      planner: head.value,
    }
  return undefined
}

function arrowNameBefore(tokens: Token[], arrow: number): string | undefined {
  let j = arrow - 1
  if (at(tokens, j)?.value === ')') {
    const open = matchBackward(tokens, j, '(', ')')
    if (open === undefined) return undefined
    j = open - 1
  } else if (at(tokens, j)?.kind === 'ident') {
    j -= 1
  } else {
    return undefined
  }
  while (at(tokens, j)?.value === 'async') j -= 1
  if (at(tokens, j)?.value !== '=') return undefined
  const nameToken = at(tokens, j - 1)
  const declarator = at(tokens, j - 2)
  if (
    nameToken !== undefined &&
    nameToken.kind === 'ident' &&
    declarator !== undefined &&
    (declarator.value === 'const' ||
      declarator.value === 'let' ||
      declarator.value === 'var')
  )
    return nameToken.value
  return undefined
}

function findParamClose(tokens: Token[], brace: number): number | undefined {
  let parens = 0
  let brackets = 0
  let braces = 0
  for (let j = brace - 1; j >= 0; j -= 1) {
    const token = at(tokens, j)
    if (token === undefined || token.kind !== 'punct') continue
    if (token.value === ')') {
      if (parens === 0 && brackets === 0 && braces === 0) return j
      parens += 1
    } else if (token.value === ']') {
      brackets += 1
    } else if (token.value === '}') {
      braces += 1
    } else if (token.value === '(') {
      if (parens === 0) return undefined
      parens -= 1
    } else if (token.value === '[') {
      if (brackets === 0) return undefined
      brackets -= 1
    } else if (token.value === '{' || token.value === '${') {
      if (braces === 0) return undefined
      braces -= 1
    } else if (token.value === ';' || token.value === '=>') {
      if (parens === 0 && brackets === 0 && braces === 0) return undefined
    }
  }
  return undefined
}

function classifyBrace(
  tokens: Token[],
  brace: number,
): { kind: 'block' } | { kind: 'func'; name: string | undefined } {
  const prev = at(tokens, brace - 1)
  if (prev !== undefined && prev.value === '=>')
    return { kind: 'func', name: arrowNameBefore(tokens, brace - 1) }
  if (prev !== undefined && prev.value === ')') {
    const open = matchBackward(tokens, brace - 1, '(', ')')
    if (open !== undefined) {
      const head = at(tokens, open - 1)
      if (head !== undefined && head.kind === 'ident') {
        if (at(tokens, open - 2)?.value === 'function')
          return { kind: 'func', name: head.value }
        if (!isControlKeyword(head.value))
          return { kind: 'func', name: head.value }
      } else if (head !== undefined && head.value === 'function') {
        return { kind: 'func', name: undefined }
      }
    }
    return { kind: 'block' }
  }
  const paramClose = findParamClose(tokens, brace)
  if (paramClose !== undefined) {
    const open = matchBackward(tokens, paramClose, '(', ')')
    if (open !== undefined) {
      const head = at(tokens, open - 1)
      if (head !== undefined && head.kind === 'ident') {
        if (at(tokens, open - 2)?.value === 'function')
          return { kind: 'func', name: head.value }
        if (!isControlKeyword(head.value))
          return { kind: 'func', name: head.value }
      } else if (head !== undefined && head.value === 'function') {
        return { kind: 'func', name: undefined }
      }
    }
  }
  return { kind: 'block' }
}

function isStatementStarter(value: string): boolean {
  return (
    value === 'const' ||
    value === 'let' ||
    value === 'var' ||
    value === 'function' ||
    value === 'class' ||
    value === 'return' ||
    value === 'if' ||
    value === 'for' ||
    value === 'while' ||
    value === 'switch' ||
    value === 'try' ||
    value === 'do' ||
    value === 'throw' ||
    value === 'import' ||
    value === 'export' ||
    value === 'else' ||
    value === 'case' ||
    value === 'default'
  )
}

function scanRange(
  tokens: Token[],
  maps: ImportMaps,
  start: number,
  end: number,
): { calls: ScannedCall[]; nested: Span[] } {
  const calls: ScannedCall[] = []
  const nested: Span[] = []
  const frames: ScopeFrame[] = []
  let parens = 0
  let braces = 0
  let brackets = 0

  const enclosing = (): string | undefined => {
    for (let f = frames.length - 1; f >= 0; f -= 1) {
      const frame = frames[f]
      if (
        frame !== undefined &&
        frame.kind === 'func' &&
        frame.name !== undefined
      )
        return frame.name
    }
    return undefined
  }

  const conciseShouldEnd = (token: Token): boolean => {
    const top = frames[frames.length - 1]
    if (top === undefined || top.kind !== 'func' || !top.concise) return false
    if (parens < top.parens || braces < top.braces || brackets < top.brackets)
      return true
    if (
      parens !== top.parens ||
      braces !== top.braces ||
      brackets !== top.brackets
    )
      return false
    if (token.kind === 'punct' && (token.value === ';' || token.value === ','))
      return true
    return token.kind === 'ident' && isStatementStarter(token.value)
  }

  let i = start
  while (i < end) {
    const token = at(tokens, i)
    if (token === undefined) break
    while (conciseShouldEnd(token)) {
      const top = frames.pop()
      if (top !== undefined && top.kind === 'func' && top.concise)
        nested.push({ end: i, start: top.start })
    }
    if (token.kind === 'ident') {
      const call = resolveCall(tokens, i, maps)
      if (call !== undefined) {
        call.enclosing = enclosing()
        calls.push(call)
      }
      i += 1
      continue
    }
    if (token.kind !== 'punct') {
      i += 1
      continue
    }
    if (token.value === '=>') {
      const next = at(tokens, i + 1)
      if (next === undefined || next.value !== '{') {
        frames.push({
          brackets,
          braces,
          concise: true,
          kind: 'func',
          name: arrowNameBefore(tokens, i),
          parens,
          start: i,
        })
      }
      i += 1
      continue
    }
    if (token.value === '(') parens += 1
    else if (token.value === ')') {
      if (parens > 0) parens -= 1
    } else if (token.value === '[') brackets += 1
    else if (token.value === ']') {
      if (brackets > 0) brackets -= 1
    } else if (token.value === '{' || token.value === '${') {
      const frame = classifyBrace(tokens, i)
      if (frame.kind === 'func') {
        frames.push({ concise: false, kind: 'func', name: frame.name })
        nested.push({ end: -1, start: i })
      } else {
        frames.push({ kind: 'block' })
      }
      braces += 1
    } else if (token.value === '}') {
      if (braces > 0) braces -= 1
      const frame = frames.pop()
      if (frame !== undefined && frame.kind === 'func' && !frame.concise) {
        for (let n = nested.length - 1; n >= 0; n -= 1) {
          const span = nested[n]
          if (span !== undefined && span.end === -1) {
            nested[n] = { end: i, start: span.start }
            break
          }
        }
      }
    }
    i += 1
  }
  return { calls, nested: nested.filter((span) => span.end !== -1) }
}

function collectPlannerCalls(): PlannerCall[] {
  const calls: PlannerCall[] = []
  for (const file of allSrcFiles) {
    const tokens = tokenize(readFileSync(file, 'utf8'))
    const maps = parseImportMaps(tokens)
    const { calls: found } = scanRange(tokens, maps, 0, tokens.length)
    for (const call of found) {
      const isInternalDelegation =
        baseName(file) === ARTIFACT_PLANNER &&
        call.enclosing === 'planCompareArtifactOperations' &&
        call.planner === 'planArtifactOperations'
      if (!isInternalDelegation)
        calls.push({
          callerFunction: call.enclosing,
          file,
          planner: call.planner,
        })
    }
  }
  return calls
}

function findBoundaryBody(tokens: Token[], boundary: string): Span | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = at(tokens, i)
    if (
      token === undefined ||
      token.kind !== 'ident' ||
      token.value !== 'function'
    )
      continue
    const nameToken = at(tokens, i + 1)
    const openToken = at(tokens, i + 2)
    if (
      nameToken === undefined ||
      nameToken.kind !== 'ident' ||
      nameToken.value !== boundary ||
      openToken === undefined ||
      openToken.value !== '('
    )
      continue
    const paramClose = matchForward(tokens, i + 2, '(', ')')
    if (paramClose === undefined) return undefined
    const bodyOpen = findBodyOpen(tokens, paramClose + 1)
    if (bodyOpen === undefined) return undefined
    const bodyClose = matchForward(tokens, bodyOpen, '{', '}')
    if (bodyClose === undefined) return undefined
    return { end: bodyClose, start: bodyOpen }
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const token = at(tokens, i)
    if (
      token === undefined ||
      token.kind !== 'ident' ||
      (token.value !== 'const' &&
        token.value !== 'let' &&
        token.value !== 'var')
    )
      continue
    const nameToken = at(tokens, i + 1)
    if (
      nameToken === undefined ||
      nameToken.kind !== 'ident' ||
      nameToken.value !== boundary ||
      at(tokens, i + 2)?.value !== '='
    )
      continue
    let parens = 0
    let brackets = 0
    let braces = 0
    for (let j = i + 3; j < tokens.length; j += 1) {
      const inner = at(tokens, j)
      if (inner === undefined) break
      if (inner.kind !== 'punct') continue
      if (inner.value === '(') parens += 1
      else if (inner.value === ')') {
        if (parens > 0) parens -= 1
      } else if (inner.value === '[') brackets += 1
      else if (inner.value === ']') {
        if (brackets > 0) brackets -= 1
      } else if (inner.value === '{' || inner.value === '${') braces += 1
      else if (inner.value === '}') {
        if (braces > 0) braces -= 1
      } else if (inner.value === '=>') {
        if (parens === 0 && brackets === 0 && braces === 0) {
          if (at(tokens, j + 1)?.value !== '{') return undefined
          const bodyClose = matchForward(tokens, j + 1, '{', '}')
          if (bodyClose === undefined) return undefined
          return { end: bodyClose, start: j + 1 }
        }
      } else if (inner.value === ';') {
        if (parens === 0 && brackets === 0 && braces === 0) return undefined
      }
    }
  }
  return undefined
}

function findBodyOpen(tokens: Token[], from: number): number | undefined {
  let parens = 0
  let brackets = 0
  let braces = 0
  let sawColon = false
  let sawSemi = false
  let sawArrow = false
  for (let i = from; i < tokens.length; i += 1) {
    const token = at(tokens, i)
    if (token === undefined || token.kind !== 'punct') continue
    if (token.value === '(') parens += 1
    else if (token.value === ')') {
      if (parens > 0) parens -= 1
    } else if (token.value === '[') brackets += 1
    else if (token.value === ']') {
      if (brackets > 0) brackets -= 1
    } else if (token.value === '{' || token.value === '${') {
      if (parens === 0 && brackets === 0 && braces === 0) {
        if (!sawColon) return i
        if (sawSemi || sawArrow) return undefined
        const close = matchForward(tokens, i, '{', '}')
        if (close === undefined) return undefined
        if (at(tokens, close + 1)?.value !== '{') return i
        i = close
        continue
      }
      braces += 1
    } else if (token.value === '}') {
      if (braces > 0) braces -= 1
      else return undefined
    } else if (token.value === ';') {
      if (parens === 0 && brackets === 0 && braces === 0) {
        if (!sawColon) return undefined
        sawSemi = true
      }
    } else if (token.value === ':') {
      if (parens === 0 && brackets === 0 && braces === 0) sawColon = true
    } else if (token.value === '=>') {
      if (parens === 0 && brackets === 0 && braces === 0) sawArrow = true
    }
  }
  return undefined
}

function findSessionVariable(
  tokens: Token[],
  body: Span,
  nested: Span[],
  maps: ImportMaps,
): string | undefined {
  for (let i = body.start + 1; i < body.end; i += 1) {
    if (inRanges(i, nested)) continue
    const declarator = at(tokens, i)
    if (
      declarator === undefined ||
      declarator.kind !== 'ident' ||
      (declarator.value !== 'const' &&
        declarator.value !== 'let' &&
        declarator.value !== 'var')
    )
      continue
    const nameToken = at(tokens, i + 1)
    if (
      nameToken === undefined ||
      nameToken.kind !== 'ident' ||
      at(tokens, i + 2)?.value !== '=' ||
      at(tokens, i + 3)?.value !== 'await'
    )
      continue
    const callee = at(tokens, i + 4)
    if (callee === undefined || callee.kind !== 'ident') continue
    if (
      (maps.authBare.has(callee.value) || callee.value === 'getAuthSession') &&
      at(tokens, i + 5)?.value === '(' &&
      at(tokens, i + 6)?.value === 'request' &&
      at(tokens, i + 7)?.value === ')'
    )
      return nameToken.value
    if (
      maps.authNamespaces.has(callee.value) &&
      (at(tokens, i + 5)?.value === '.' || at(tokens, i + 5)?.value === '?.') &&
      at(tokens, i + 6)?.value === 'getAuthSession' &&
      at(tokens, i + 7)?.value === '(' &&
      at(tokens, i + 8)?.value === 'request' &&
      at(tokens, i + 9)?.value === ')'
    )
      return nameToken.value
  }
  return undefined
}

function findIdentityVariable(
  tokens: Token[],
  body: Span,
  nested: Span[],
  sessionVar: string,
): string | undefined {
  for (let i = body.start + 1; i < body.end; i += 1) {
    if (inRanges(i, nested)) continue
    const declarator = at(tokens, i)
    if (
      declarator === undefined ||
      declarator.kind !== 'ident' ||
      (declarator.value !== 'const' &&
        declarator.value !== 'let' &&
        declarator.value !== 'var')
    )
      continue
    const nameToken = at(tokens, i + 1)
    const sessionToken = at(tokens, i + 3)
    if (
      nameToken === undefined ||
      nameToken.kind !== 'ident' ||
      at(tokens, i + 2)?.value !== '=' ||
      sessionToken === undefined ||
      sessionToken.kind !== 'ident' ||
      sessionToken.value !== sessionVar ||
      (at(tokens, i + 4)?.value !== '.' && at(tokens, i + 4)?.value !== '?.') ||
      at(tokens, i + 5)?.value !== 'user' ||
      (at(tokens, i + 6)?.value !== '.' && at(tokens, i + 6)?.value !== '?.') ||
      at(tokens, i + 7)?.value !== 'id'
    )
      continue
    return nameToken.value
  }
  return undefined
}

function findOwnBodyPlannerCalls(
  tokens: Token[],
  body: Span,
  nested: Span[],
  maps: ImportMaps,
  expected: PlannerName,
): ScannedCall[] {
  const { calls } = scanRange(tokens, maps, body.start + 1, body.end)
  return calls.filter(
    (call) => call.planner === expected && !inRanges(call.nameIndex, nested),
  )
}

function forwardsAuthenticatedIdentity(
  tokens: Token[],
  call: ScannedCall,
  identityVar: string,
): boolean {
  const close = matchForward(tokens, call.openParen, '(', ')')
  if (close === undefined) return false
  for (let i = call.openParen + 1; i < close; i += 1) {
    const token = at(tokens, i)
    if (token === undefined || token.kind !== 'punct' || token.value !== '{')
      continue
    const objectClose = matchForward(tokens, i, '{', '}')
    if (objectClose === undefined || objectClose > close) continue
    let depth = 0
    for (let k = i + 1; k < objectClose; k += 1) {
      const property = at(tokens, k)
      if (property === undefined) break
      if (property.kind === 'punct') {
        if (property.value === '{' || property.value === '${') depth += 1
        else if (property.value === '}') depth -= 1
        continue
      }
      if (depth !== 0) continue
      const key =
        property.kind === 'ident'
          ? property.value
          : property.kind === 'string'
            ? stripQuotes(property.value)
            : undefined
      if (key !== 'userId') continue
      const after = at(tokens, k + 1)
      if (after === undefined) continue
      if (after.value === ',' || after.value === '}') {
        if (property.kind === 'ident' && property.value === identityVar)
          return true
        continue
      }
      if (after.value !== ':') continue
      const forwarded = at(tokens, k + 2)
      if (
        forwarded !== undefined &&
        forwarded.kind === 'ident' &&
        forwarded.value === identityVar
      )
        return true
    }
    i = objectClose
  }
  return false
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
        (!content.includes('getAuthSession') &&
          !content.includes('requireAdminSession')) &&
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
        (!readFileSync(f, 'utf8').includes('getAuthSession') &&
          !readFileSync(f, 'utf8').includes('requireAdminSession')) &&
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

  it('artifact planner exemption is secured by its authenticated direct caller', () => {
    expect(NO_REQUEST_BOUNDARY.has(ARTIFACT_PLANNER)).toBe(true)

    const callerFile = join(SRC, 'server', 'core', ARTIFACT_PLANNER_CALLER)
    const calls = collectPlannerCalls()
    const sortKey = (call: PlannerCall): string =>
      `${call.callerFunction ?? ''}:${call.planner}:${call.file}`
    const sortedCalls = [...calls].sort((a, b) =>
      sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0,
    )
    const expectedCalls: PlannerCall[] = [
      {
        callerFunction: 'generateArtifactsCore',
        file: callerFile,
        planner: 'planArtifactOperations',
      },
      {
        callerFunction: 'generateCompareArtifactsCore',
        file: callerFile,
        planner: 'planCompareArtifactOperations',
      },
    ]
    expect(sortedCalls).toEqual(expectedCalls)

    const callerTokens = tokenize(readFileSync(callerFile, 'utf8'))
    const callerMaps = parseImportMaps(callerTokens)
    const expectedBoundaries: Array<{
      boundary: string
      planner: PlannerName
    }> = [
      { boundary: 'generateArtifactsCore', planner: 'planArtifactOperations' },
      {
        boundary: 'generateCompareArtifactsCore',
        planner: 'planCompareArtifactOperations',
      },
    ]
    for (const { boundary, planner } of expectedBoundaries) {
      const body = findBoundaryBody(callerTokens, boundary)
      expect(body).toBeDefined()
      if (!body) continue
      const { nested } = scanRange(
        callerTokens,
        callerMaps,
        body.start + 1,
        body.end,
      )
      const sessionVar = findSessionVariable(
        callerTokens,
        body,
        nested,
        callerMaps,
      )
      expect(sessionVar).toBeDefined()
      if (!sessionVar) continue
      const identityVar = findIdentityVariable(
        callerTokens,
        body,
        nested,
        sessionVar,
      )
      expect(identityVar).toBeDefined()
      if (!identityVar) continue
      const ownCalls = findOwnBodyPlannerCalls(
        callerTokens,
        body,
        nested,
        callerMaps,
        planner,
      )
      expect(ownCalls).toHaveLength(1)
      const plannerCall = ownCalls[0]
      expect(plannerCall).toBeDefined()
      if (!plannerCall) continue
      expect(
        forwardsAuthenticatedIdentity(callerTokens, plannerCall, identityVar),
      ).toBe(true)
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
