import { describe, expect, it } from 'vitest'
import {
  extractPlainContent,
  shouldExpandCompareCard,
  OLD_COMPARE_CARD_WIDTH,
  CURRENT_WIDE_COMPARE_CARD_WIDTH,
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

  it('expands for substantive multi-line content (>= 6 lines)', () => {
    const multiLine = `Langkah 1: Inisialisasi proyek
Langkah 2: Konfigurasi basis data
Langkah 3: Tulis skema Drizzle
Langkah 4: Jalankan migrasi
Langkah 5: Siapkan server functions
Langkah 6: Uji endpoint dengan Vitest`
    expect(shouldExpandCompareCard(multiLine)).toBe(true)
  })

  it('handles empty, null, or whitespace content cleanly as compact', () => {
    expect(shouldExpandCompareCard(null)).toBe(false)
    expect(shouldExpandCompareCard(undefined)).toBe(false)
    expect(shouldExpandCompareCard('')).toBe(false)
    expect(shouldExpandCompareCard('   \n  ')).toBe(false)
  })

  it('strips markdown syntax when measuring plain text', () => {
    const formatted = '# Heading\n**Teks tebal** dan *miring* serta [tautan](https://example.com)'
    const plain = extractPlainContent(formatted)
    expect(plain).not.toContain('#')
    expect(plain).not.toContain('**')
    expect(plain).not.toContain('[')
    expect(plain).toContain('Teks tebal')
    expect(plain).toContain('tautan')
  })
})
