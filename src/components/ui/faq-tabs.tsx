import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FaqQuestion {
  question: string
  answer: string
}

export type FaqCategories = Record<string, string>
export type FaqData = Record<string, FaqQuestion[]>

export interface FAQProps extends React.HTMLAttributes<HTMLElement> {
  title?: string
  subtitle?: string
  categories: FaqCategories
  faqData: FaqData
}

// Main reusable FAQ component
export const FAQ = ({
  title = 'Pertanyaan yang Sering Diajukan',
  subtitle = '',
  categories,
  faqData,
  className,
  ...props
}: FAQProps) => {
  const categoryKeys = Object.keys(categories)
  const [selectedCategory, setSelectedCategory] = useState(
    categoryKeys[0] ?? '',
  )

  return (
    <section
      className={cn(
        'relative overflow-hidden bg-background px-4 py-12 text-foreground md:py-16',
        className,
      )}
      {...props}
    >
      <FAQHeader title={title} subtitle={subtitle} />
      <FAQTabs
        categories={categories}
        selected={selectedCategory}
        setSelected={setSelectedCategory}
      />
      <FAQList faqData={faqData} selected={selectedCategory} />
    </section>
  )
}

interface FAQHeaderProps {
  title: string
  subtitle?: string
}

const FAQHeader = ({ title, subtitle }: FAQHeaderProps) => (
  <div className="relative z-10 flex flex-col items-center justify-center text-center">
    {subtitle ? (
      <span className="mb-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-sm font-semibold tracking-wide uppercase text-transparent">
        {subtitle}
      </span>
    ) : null}
    <h2 className="mb-8 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
      {title}
    </h2>
    <span
      className="pointer-events-none absolute -top-[350px] left-[50%] z-0 h-[500px] w-[600px] -translate-x-[50%] rounded-full bg-gradient-to-r from-primary/10 to-primary/5 blur-3xl"
      aria-hidden="true"
    />
  </div>
)

interface FAQTabsProps {
  categories: FaqCategories
  selected: string
  setSelected: (key: string) => void
}

const FAQTabs = ({ categories, selected, setSelected }: FAQTabsProps) => (
  <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
    {Object.entries(categories).map(([key, label]) => (
      <button
        key={key}
        type="button"
        onClick={() => setSelected(key)}
        className={cn(
          'relative overflow-hidden whitespace-nowrap rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors duration-300',
          selected === key
            ? 'border-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="relative z-10">{label}</span>
        <AnimatePresence>
          {selected === key && (
            <motion.span
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.3, ease: 'backIn' }}
              className="absolute inset-0 z-0 bg-primary"
            />
          )}
        </AnimatePresence>
      </button>
    ))}
  </div>
)

interface FAQListProps {
  faqData: FaqData
  selected: string
}

const FAQList = ({ faqData, selected }: FAQListProps) => (
  <div className="mx-auto mt-10 max-w-3xl md:mt-12">
    <AnimatePresence mode="wait">
      {Object.entries(faqData).map(([category, questions]) => {
        if (selected === category) {
          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="space-y-3.5"
            >
              {questions.map((faq) => (
                <FAQItem
                  key={`${category}-${faq.question}`}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))}
            </motion.div>
          )
        }
        return null
      })}
    </AnimatePresence>
  </div>
)

interface FAQItemProps {
  question: string
  answer: string
}

const FAQItem = ({ question, answer }: FAQItemProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div
      animate={isOpen ? 'open' : 'closed'}
      className={cn(
        'rounded-xl border border-border transition-colors duration-200',
        isOpen ? 'bg-card' : 'bg-card hover:border-hairline-strong',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
      >
        <span
          className={cn(
            'text-base font-medium transition-colors md:text-lg',
            isOpen ? 'font-semibold text-foreground' : 'text-foreground/80',
          )}
        >
          {question}
        </span>
        <motion.span
          variants={{
            open: { rotate: '45deg' },
            closed: { rotate: '0deg' },
          }}
          transition={{ duration: 0.2 }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-foreground"
        >
          <Plus
            className={cn(
              'h-4 w-4 transition-colors',
              isOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : '0px',
          marginBottom: isOpen ? '16px' : '0px',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="overflow-hidden px-4 sm:px-5"
      >
        <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">
          {answer}
        </p>
      </motion.div>
    </motion.div>
  )
}
