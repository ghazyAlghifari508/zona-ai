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
  { id: 'umum', label: 'Umum' },
  { id: 'compare', label: 'Bandingkan Model' },
  { id: 'fitur', label: 'Fitur & Dokumen' },
  { id: 'kredit', label: 'Kredit & Upgrade' },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: '1',
    category: 'umum',
    title: 'Apa itu Zona.ai?',
    content:
      'Zona.ai adalah ruang kerja AI multi-model berkinerja tinggi. Kamu bisa berinteraksi dengan berbagai model terkemuka, membandingkan kualitas jawabannya secara berdampingan, melakukan penelusuran web terpadu, dan menganalisis dokumen secara mendalam.',
  },
  {
    id: '2',
    category: 'umum',
    title: 'Bagaimana Zona.ai berbeda dari platform AI lainnya?',
    content:
      'Zona.ai dirancang dengan prinsip synchronous comparison dan dynamic model registry tanpa model hardcoded. Kamu mendapatkan perbandingan yang adil di satu kanvas tanpa perlu berpindah-pindah tab browser.',
  },
  {
    id: '3',
    category: 'umum',
    title: 'Apakah saya perlu API key sendiri untuk menggunakan model?',
    content:
      'Tidak. Seluruh perutean model dikelola secara otomatis melalui proxy router kami. Cukup login ke akun Zona.ai dan kamu langsung bisa memilih model apa saja yang tersedia.',
  },
  {
    id: '4',
    category: 'compare',
    title: 'Apa itu Compare Mode?',
    content:
      'Compare Mode memungkinkan kamu mengirimkan satu pertanyaan yang sama ke 2 hingga 4 model AI sekaligus. Respons dari tiap model akan ditampilkan berdampingan dalam grid 2 kolom yang mudah dibaca.',
  },
  {
    id: '5',
    category: 'compare',
    title: 'Berapa banyak model yang bisa dibandingkan secara bersamaan?',
    content:
      'Kamu bisa memilih 2, 3, atau hingga 4 model secara bersamaan. Layout respons secara responsif menyesuaikan ukuran agar tetap proporsional dan nyaman dibaca.',
  },
  {
    id: '6',
    category: 'compare',
    title: 'Bagaimana jika salah satu model gagal saat Compare Mode?',
    content:
      'Zona.ai menerapkan mekanisme fair failure: respons model yang berhasil akan tetap utuh tersimpan di timeline, biaya kredit untuk model yang gagal akan dikembalikan otomatis, dan kamu dapat mencoba ulang model yang gagal kapan saja.',
  },
  {
    id: '7',
    category: 'fitur',
    title: 'Apakah Zona.ai mendukung pencarian web secara langsung?',
    content:
      'Ya. Kamu bisa mengaktifkan pencarian web (Tavily) langsung dari komposer. Sistem akan melakukan satu kali pengambilan sumber terpercaya (single-fetch) dan membagikannya ke seluruh model yang kamu bandingkan.',
  },
  {
    id: '8',
    category: 'fitur',
    title: 'Format dokumen apa saja yang bisa diunggah?',
    content:
      'Zona.ai mendukung file PDF, Microsoft Word (.docx), file teks (.txt), CSV, dan gambar (PNG, JPEG, WebP). Dokumen akan diekstraksi dan diindeks secara aman menggunakan pgvector.',
  },
  {
    id: '9',
    category: 'fitur',
    title: 'Bagaimana cara kerja analisis dokumen (RAG)?',
    content:
      'Dokumen yang kamu lampirkan akan dibagi menjadi potongan teks (chunks) dan dicocokkan dengan pertanyaanmu menggunakan pencarian kemiripan kosinus, sehingga model AI dapat menjawab berdasarkan isi dokumen tersebut.',
  },
  {
    id: '10',
    category: 'kredit',
    title: 'Bagaimana sistem kredit bekerja?',
    content:
      'Setiap pesan yang kamu kirim menggunakan sejumlah kredit tergantung bobot model yang dipilih. Saldo kredit ditampilkan secara transparan di sidebar dan langsung diperbarui.',
  },
  {
    id: '11',
    category: 'kredit',
    title: 'Apakah ada kredit gratis untuk pengguna baru?',
    content:
      'Ya. Setiap akun baru secara otomatis mendapatkan saldo kredit awal untuk mencoba fitur chat dan compare mode dengan berbagai model AI yang tersedia.',
  },
  {
    id: '12',
    category: 'kredit',
    title: 'Bagaimana cara upgrade paket atau menambah kredit?',
    content:
      'Klik tombol Upgrade di pojok kanan atas atau navigasikan ke halaman Pricing untuk memilih paket Pro atau Ultra dengan kuota kredit yang lebih besar.',
  },
]

export function FaqSection() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filteredItems =
    selectedCategory === 'all'
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((item) => item.category === selectedCategory)

  return (
    <div className="mx-auto w-full max-w-[760px] py-8 md:py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-ink md:text-4xl">
          Pertanyaan yang Sering Diajukan
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-graphite">
          Jawaban seputar fitur, model AI, dan cara kerja Zona.ai.
        </p>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {FAQ_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-md border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
              selectedCategory === cat.id
                ? 'border-notion-blue bg-notion-blue text-pure-white'
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
    </div>
  )
}
