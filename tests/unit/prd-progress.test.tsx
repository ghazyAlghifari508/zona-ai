import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FileCard, formatFileSize } from '../../src/components/chat/FileCard'
import {
  getPrdStatusText,
  PrdProgress,
} from '../../src/components/chat/PrdProgress'

describe('PrdProgress', () => {
  afterEach(() => {
    cleanup()
  })

  it('maps each phase and section to correct Indonesian text', () => {
    expect(getPrdStatusText('preparing')).toBe('Menyiapkan PRD...')
    expect(getPrdStatusText('generating', 'overview')).toBe('Menulis overview...')
    expect(getPrdStatusText('generating', 'requirements')).toBe(
      'Menyusun requirements...',
    )
    expect(getPrdStatusText('generating', 'features')).toBe(
      'Menulis fitur inti...',
    )
    expect(getPrdStatusText('generating', 'userflow')).toBe(
      'Menyusun user flow...',
    )
    expect(getPrdStatusText('generating', 'architecture')).toBe(
      'Merancang arsitektur...',
    )
    expect(getPrdStatusText('generating', 'schema')).toBe(
      'Membuat database schema...',
    )
    expect(getPrdStatusText('generating', 'techstack')).toBe(
      'Menyusun tech stack...',
    )
    expect(getPrdStatusText('generating')).toBe('Menulis dokumen...')
    expect(getPrdStatusText('creating_file')).toBe(
      'Menyiapkan file Markdown...',
    )
    expect(getPrdStatusText('completed')).toBe('PRD selesai dibuat.')
    expect(getPrdStatusText('error')).toBe('Pembuatan PRD gagal.')
  })

  it('renders preparing state', () => {
    render(<PrdProgress phase="preparing" />)
    const el = screen.getByTestId('prd-progress')
    expect(el.getAttribute('data-phase')).toBe('preparing')
    expect(screen.getByTestId('prd-progress-text').textContent).toBe(
      'Menyiapkan PRD...',
    )
  })

  it('renders generating state with section badge', () => {
    render(<PrdProgress phase="generating" section="schema" />)
    expect(screen.getByTestId('prd-progress-text').textContent).toBe(
      'Membuat database schema...',
    )
    expect(screen.getByTestId('prd-progress-badge').textContent).toBe('schema')
  })

  it('renders creating_file state', () => {
    render(<PrdProgress phase="creating_file" />)
    expect(screen.getByTestId('prd-progress-text').textContent).toBe(
      'Menyiapkan file Markdown...',
    )
  })

  it('renders error state with custom message if provided', () => {
    render(
      <PrdProgress
        phase="error"
        errorMessage="PRD berhasil dibuat, tetapi file gagal disiapkan."
      />,
    )
    expect(screen.getByTestId('prd-progress-text').textContent).toBe(
      'PRD berhasil dibuat, tetapi file gagal disiapkan.',
    )
  })
})

describe('FileCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('formats file sizes accurately', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(18432)).toBe('18.0 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
  })

  it('renders file name, size, and download link', () => {
    const artifact = {
      attachmentId: 'att-12345',
      fileName: 'PRD-Fitur-Login.md',
      fileSize: 18432,
      mimeType: 'text/markdown',
    }

    render(<FileCard artifact={artifact} />)

    expect(screen.getByTestId('prd-file-name').textContent).toBe(
      'PRD-Fitur-Login.md',
    )
    expect(screen.getByTestId('prd-file-size').textContent).toBe('18.0 KB')

    const downloadBtn = screen.getByTestId('prd-download-btn')
    expect(downloadBtn.getAttribute('href')).toBe(
      '/api/attachments/att-12345',
    )
    expect(downloadBtn.getAttribute('download')).toBe('PRD-Fitur-Login.md')
  })
})
