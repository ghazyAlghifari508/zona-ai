import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FaqItem {
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Apa itu Zona.ai?',
    answer:
      'Zona.ai adalah ruang kerja AI multi-model. Kamu bisa bertanya ke beberapa model AI sekaligus, membandingkan jawabannya, mencari sumber dari web, dan mengunggah dokumen untuk dianalisis.',
  },
  {
    question: 'Bagaimana sistem kredit bekerja?',
    answer:
      'Setiap pesan yang kamu kirim menggunakan sejumlah kredit tergantung model yang dipilih. Saldo kredit ditampilkan di sidebar. Paket gratis memberi kredit bulanan tertentu, dan kamu bisa upgrade untuk menambah kapasitas.',
  },
  {
    question: 'Apa itu Compare Mode?',
    answer:
      'Compare Mode memungkinkan kamu mengirim satu pertanyaan yang sama ke beberapa model AI sekaligus. Jawaban dari setiap model ditampilkan berdampingan sehingga mudah dibandingkan.',
  },
  {
    question: 'Apakah Zona.ai mendukung pencarian web?',
    answer:
      'Ya. Kamu bisa mengaktifkan pencarian web (Tavily) dari komposer. Hasil dan sumber yang ditemukan akan dipakai untuk memperkaya jawaban model.',
  },
  {
    question: 'Bisakah saya mengunggah dokumen?',
    answer:
      'Bisa. Kamu dapat melampirkan file seperti PDF, teks, CSV, Word, dan gambar. Dokumen akan diproses agar model bisa menganalisis isinya.',
  },
  {
    question: 'Bagaimana cara upgrade paket?',
    answer:
      'Klik tombol Upgrade di pojok kanan atas, lalu pilih paket Pro atau Ultra pada halaman Pricing. Pembayaran otomatis akan aktif pada tahap berikutnya.',
  },
]

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="space-y-2.5">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = open === index
          return (
            <div
              key={item.question}
              className="rounded-xl border border-hairline bg-pure-white transition-colors duration-200 hover:border-hairline-strong"
            >
              <button
                type="button"
                data-testid={`faq-item-${index}`}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {item.question}
                </span>
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-200',
                    isOpen
                      ? 'rotate-180 bg-sky-tint text-notion-blue'
                      : 'bg-ink/5 text-ink/60',
                  )}
                >
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {isOpen && (
                <p className="border-t border-hairline px-5 py-4 text-[14px] leading-relaxed text-graphite">
                  {item.answer}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FaqSection() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-12 lg:px-6 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[clamp(28px,4.5vw,44px)] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
          Pertanyaan yang sering diajukan
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-graphite">
          Jawaban cepat untuk hal-hal yang paling sering ditanyakan tentang
          Zona.ai.
        </p>
      </div>
      <div className="mt-10">
        <FaqAccordion />
      </div>
    </div>
  )
}
