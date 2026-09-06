import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@/components/ui/cnippet-accordion'

export interface FaqItem {
  id: string
  category: string
  title: string
  content: string
}

export const FAQ_CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'kredit', label: 'Kredit & Kuota' },
  { id: 'compare', label: 'Bandingkan Model' },
  { id: 'file', label: 'File & Dokumen' },
  { id: 'umum', label: 'Umum & Keamanan' },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: '1',
    category: 'kredit',
    title: 'Berapa kredit yang saya dapatkan, dan kapan di-reset?',
    content:
      'Akun gratis mendapatkan 100 kredit setiap awal bulan. Saldo kredit bulanan diperbarui otomatis setiap tanggal 1 dan tidak diakumulasikan ke bulan berikutnya.',
  },
  {
    id: '2',
    category: 'kredit',
    title: 'Bagaimana perhitungan kredit saat mengirim pesan?',
    content:
      'Kredit dipotong per model yang dipilih. Model standar memotong 1 kredit, sedangkan model penalaran berat membutuhkan kredit lebih banyak sesuai indikator biaya yang tertera pada pemilih model.',
  },
  {
    id: '3',
    category: 'kredit',
    title: 'Apa yang terjadi jika kredit saya habis?',
    content:
      'Jika kuota kredit bulanan habis, kamu dapat menunggu pembaruan kuota di awal bulan berikutnya atau melakukan upgrade ke paket Pro maupun Ultra untuk menambah kapasitas kredit.',
  },
  {
    id: '4',
    category: 'compare',
    title: 'Berapa kredit yang terpotong saat membandingkan beberapa model?',
    content:
      'Kredit yang terpotong adalah akumulasi dari masing-masing model yang aktif. Contohnya, jika kamu membandingkan model berbiaya 1 kredit dan 4 kredit, total saldo yang terpotong adalah 5 kredit.',
  },
  {
    id: '5',
    category: 'compare',
    title: 'Bagaimana jika salah satu model gagal merespons saat dibandingkan?',
    content:
      'Kredit untuk model yang gagal otomatis dikembalikan seketika ke saldomu, sementara jawaban dari model lain yang berhasil tetap tersimpan utuh di riwayat percakapan.',
  },
  {
    id: '6',
    category: 'file',
    title: 'Apa format dan batas ukuran file yang bisa diunggah?',
    content:
      'Zona.ai mendukung dokumen PDF, Word (.docx), teks (.txt), CSV, dan gambar (PNG, JPG, WebP) dengan batas ukuran maksimal 10 MB per file.',
  },
  {
    id: '7',
    category: 'file',
    title: 'Bagaimana cara kerja analisis dokumen?',
    content:
      'Dokumen yang kamu unggah diekstraksi teksnya dan dicocokkan dengan pertanyaanmu, sehingga model AI dapat memberikan rujukan dan jawaban yang relevan berdasarkan isi dokumen.',
  },
  {
    id: '8',
    category: 'umum',
    title: 'Model AI apa saja yang tersedia di Zona.ai?',
    content:
      'Zona.ai menyediakan beragam model terkemuka seperti OpenAI, Google (Gemini), Qwen, MiMo, GLM, dan model unggulan lainnya. Daftar model diperbarui secara dinamis.',
  },
  {
    id: '9',
    category: 'umum',
    title: 'Apakah riwayat percakapan saya tersimpan otomatis?',
    content:
      'Ya, seluruh riwayat obrolan dan perbandingan model tersimpan otomatis di akunmu dan dapat diakses kembali kapan saja melalui menu riwayat di sidebar.',
  },
  {
    id: '10',
    category: 'umum',
    title: 'Apakah dokumen dan data percakapan saya aman?',
    content:
      'Seluruh percakapan dan dokumen kamu bersifat privat dan hanya dapat diakses melalui akunmu sendiri. Data tidak dibagikan atau dipublikasikan ke pengguna lain.',
  },
]

export function FaqSection() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filteredItems =
    selectedCategory === 'all'
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((item) => item.category === selectedCategory)

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {FAQ_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-md border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
              selectedCategory === cat.id
                ? 'border-accent bg-accent text-white'
                : 'border-hairline bg-pure-white text-stone hover:text-ink'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-hairline bg-pure-white px-6 py-2">
        <Accordion className="w-full" defaultValue={['1']}>
          {filteredItems.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.title}</AccordionTrigger>
              <AccordionPanel>{item.content}</AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover active:scale-95"
        >
          Lihat Paket & Harga
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      </div>
    </div>
  )
}
