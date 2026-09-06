import { describe, expect, it } from 'vitest'
import {
  CURRENT_WIDE_COMPARE_CARD_WIDTH,
  extractPlainContent,
  getCompareGridClasses,
  OLD_COMPARE_CARD_WIDTH,
  shouldExpandCompareCard,
} from '../../src/lib/chat/compare-card-width'

describe('compare card width heuristics', () => {
  it('defines old width as 400px and current wide width as 650px', () => {
    expect(OLD_COMPARE_CARD_WIDTH).toBe(400)
    expect(CURRENT_WIDE_COMPARE_CARD_WIDTH).toBe(650)
  })

  it('keeps very short answers like "42" compact', () => {
    expect(shouldExpandCompareCard('42')).toBe(false)
  })

  it('keeps 1-2 short sentences compact', () => {
    const singleSentence =
      'Ibu kota masa depan Indonesia adalah Nusantara yang terletak di Kalimantan Timur.'
    expect(shouldExpandCompareCard(singleSentence)).toBe(false)

    const twoSentences =
      'Jakarta adalah pusat ekonomi saat ini. Namun pusat pemerintahan akan beralih ke Nusantara secara bertahap.'
    expect(shouldExpandCompareCard(twoSentences)).toBe(false)
  })

  it('keeps short lists of 3-4 items compact', () => {
    const shortList = `Berikut 3 tips kesehatan:
- Minum air putih cukup
- Tidur teratur 8 jam
- Olahraga ringan pagi hari`
    expect(shouldExpandCompareCard(shortList)).toBe(false)
  })

  it('expands when code blocks are present', () => {
    const codeSnippet = '```typescript\nconst answer: number = 42;\n```'
    expect(shouldExpandCompareCard(codeSnippet)).toBe(true)
  })

  it('expands when markdown tables are present', () => {
    const table = `| Fitur | Model A | Model B |
|---|---|---|
| Latensi | 200ms | 400ms |`
    expect(shouldExpandCompareCard(table)).toBe(true)
  })

  it('expands for long explanations exceeding character threshold', () => {
    const longText =
      'Arsitektur microservices memisahkan aplikasi besar menjadi modul-modul independen yang dapat dideploy dan di-scale secara terpisah. Setiap service mengelola basis datanya sendiri dan berkomunikasi melalui protokol ringan seperti REST API atau gRPC. Pendekatan ini meningkatkan kecepatan deployment tim besar namun menambah kompleksitas operasional.'
    expect(shouldExpandCompareCard(longText)).toBe(true)
  })

  it('expands for substantive multi-line content (>= 5 lines)', () => {
    const multiLine = `Langkah 1: Inisialisasi proyek
Langkah 2: Konfigurasi basis data
Langkah 3: Tulis skema Drizzle
Langkah 4: Jalankan migrasi
Langkah 5: Siapkan server functions`
    expect(shouldExpandCompareCard(multiLine)).toBe(true)
  })

  it('handles empty, null, or whitespace content cleanly as compact', () => {
    expect(shouldExpandCompareCard(null)).toBe(false)
    expect(shouldExpandCompareCard(undefined)).toBe(false)
    expect(shouldExpandCompareCard('')).toBe(false)
    expect(shouldExpandCompareCard('   \n  ')).toBe(false)
  })

  it('strips markdown syntax when measuring plain text', () => {
    const formatted =
      '# Heading\n**Teks tebal** dan *miring* serta [tautan](https://example.com)'
    const plain = extractPlainContent(formatted)
    expect(plain).not.toContain('#')
    expect(plain).not.toContain('**')
    expect(plain).not.toContain('[')
    expect(plain).toContain('Teks tebal')
    expect(plain).toContain('tautan')
  })
})

describe('getCompareGridClasses', () => {
  it('returns compact 860px container with 2 equal columns and items-stretch when both models are compact', () => {
    const generations = [
      { id: 'g1', content: '42' },
      { id: 'g2', content: 'Jakarta' },
    ]
    const sizing = getCompareGridClasses(generations, new Set())
    expect(sizing.containerClass).toContain('max-w-[860px]')
    expect(sizing.gridClass).toContain('md:grid-cols-2')
    expect(sizing.gridClass).toContain('items-stretch')
  })

  it('returns expanded 1360px container with 2 equal columns and items-stretch when both models are expanded', () => {
    const long1 = 'A'.repeat(200)
    const long2 = 'B'.repeat(200)
    const generations = [
      { id: 'g1', content: long1 },
      { id: 'g2', content: long2 },
    ]
    const sizing = getCompareGridClasses(generations, new Set())
    expect(sizing.containerClass).toContain('max-w-[1360px]')
    expect(sizing.gridClass).toContain('md:grid-cols-2')
    expect(sizing.gridClass).toContain('items-stretch')
  })

  it('returns asymmetric 2-column grid when model 0 is compact and model 1 is expanded', () => {
    const generations = [
      { id: 'g1', content: '42' },
      { id: 'g2', content: 'Long detailed explanation '.repeat(10) },
    ]
    const sizing = getCompareGridClasses(generations, new Set())
    expect(sizing.containerClass).toContain('max-w-[1360px]')
    expect(sizing.gridClass).toContain(
      'md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]',
    )
    expect(sizing.gridClass).toContain('items-stretch')
  })

  it('returns asymmetric 2-column grid when model 0 is expanded and model 1 is compact', () => {
    const generations = [
      { id: 'g1', content: 'Long detailed explanation '.repeat(10) },
      { id: 'g2', content: '42' },
    ]
    const sizing = getCompareGridClasses(generations, new Set())
    expect(sizing.containerClass).toContain('max-w-[1360px]')
    expect(sizing.gridClass).toContain(
      'md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]',
    )
    expect(sizing.gridClass).toContain('items-stretch')
  })

  it('supports single-generation compare sizing with items-stretch', () => {
    const compactGen = [{ id: 'single-1', content: '42' }]
    const compactSizing = getCompareGridClasses(compactGen, new Set())
    expect(compactSizing.containerClass).toContain('max-w-[440px]')
    expect(compactSizing.gridClass).toContain('grid-cols-1')
    expect(compactSizing.gridClass).toContain('items-stretch')

    const expandedGen = [
      { id: 'single-2', content: 'Long explanation '.repeat(15) },
    ]
    const expandedSizing = getCompareGridClasses(expandedGen, new Set())
    expect(expandedSizing.containerClass).toContain('max-w-[680px]')
    expect(expandedSizing.gridClass).toContain('grid-cols-1')
    expect(expandedSizing.gridClass).toContain('items-stretch')
  })
})
