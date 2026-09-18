import { describe, expect, it } from 'vitest'
import { autoHealMermaid } from '../../src/lib/chat/mermaid'

describe('autoHealMermaid', () => {
  it('handles empty or non-string inputs safely', () => {
    expect(autoHealMermaid('')).toBe('')
    expect(autoHealMermaid('   ')).toBe('')
  })

  it('strips markdown code block fences', () => {
    const raw = '```mermaid\ngraph TD\n  A --> B\n```'
    expect(autoHealMermaid(raw)).toBe('graph TD\n  A --> B')
  })

  it('strips leading mermaid keyword on its own line', () => {
    const raw = 'mermaid\ngraph TD\n  A --> B'
    expect(autoHealMermaid(raw)).toBe('graph TD\n  A --> B')
  })

  it('strips blockquote prefixes', () => {
    const raw = '> graph TD\n>   A --> B'
    expect(autoHealMermaid(raw)).toBe('graph TD\n  A --> B')
  })

  it('converts // and # comments to Mermaid %% comments', () => {
    const raw = 'graph TD\n  // this is a comment\n  # another comment\n  A --> B'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('%% this is a comment')
    expect(healed).toContain('%% another comment')
  })

  it('strips trailing semicolons from headers', () => {
    const raw = 'graph TD;\n  A --> B'
    expect(autoHealMermaid(raw)).toBe('graph TD\n  A --> B')
  })

  it('prepends flowchart TD if diagram declaration is missing', () => {
    const raw = 'A --> B\nB --> C'
    expect(autoHealMermaid(raw)).toBe('flowchart TD\nA --> B\nB --> C')
  })

  it('balances unclosed subgraphs with matching ends', () => {
    const raw = 'graph TD\n  subgraph Cluster1\n  subgraph Cluster2\n  A --> B'
    const healed = autoHealMermaid(raw)
    const endMatches = healed.match(/\bend\b/g)
    expect(endMatches?.length).toBe(2)
  })

  it('auto-quotes square box labels with special characters (parentheses, slashes, etc.)', () => {
    const raw =
      'graph TD\n  A[App (iOS/Android)] --> B[Local Storage / MMKV]\n  B --> C[Status: OK]'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('A["App (iOS/Android)"]')
    expect(healed).toContain('B["Local Storage / MMKV"]')
    expect(healed).toContain('C["Status: OK"]')
  })

  it('auto-quotes rounded, diamond, and cylinder labels with special characters', () => {
    const raw =
      'graph TD\n  A[(Database (Postgres))] --> B{Check (Valid)?}\n  B --> C(Round [v1])'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('A[("Database (Postgres)")]')
    expect(healed).toContain('B{"Check (Valid)?"}')
    expect(healed).toContain('C("Round [v1]")')
  })

  it('auto-quotes edge labels with special characters', () => {
    const raw = 'graph TD\n  A -->|GET /api/v1 (Users)| B'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('-->|"GET /api/v1 (Users)"|')
  })

  it('heals invalid flow arrows in erDiagram to standard relations', () => {
    const raw = 'erDiagram\n  USER --> ORDER : places'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('USER ||--o{ ORDER : places')
  })

  it('heals nested brackets inside square boxes', () => {
    const raw = 'graph TD\n  A[Node [1]] --> B'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('A["Node [1]"]')
  })

  it('converts inner unescaped double quotes to single quotes within labels', () => {
    const raw = 'graph TD\n  A[App "v1"] --> B'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('A["App \'v1\'"]')
  })

  it('preserves existing valid quoted labels unchanged', () => {
    const raw = 'graph TD\n  A["Already Quoted (Label)"] --> B["Another One"]'
    const healed = autoHealMermaid(raw)
    expect(healed).toContain('A["Already Quoted (Label)"]')
    expect(healed).toContain('B["Another One"]')
  })
})
