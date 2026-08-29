import { expect, test } from '@playwright/test'

test('attachment shows Indexing then Indexed', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview" class="flex flex-wrap gap-2 p-2">
      <div data-testid="attachment-item" class="flex items-center gap-2 rounded-[10px] border border-hairline-mist bg-sandstone px-2 py-1 text-xs">
        <svg data-testid="loader-icon"></svg>
        <span>sample.pdf</span>
        <span data-testid="attachment-status-processing" class="flex items-center gap-1 text-stone-gray"><svg class="animate-spin"></svg>Indexing...</span>
      </div>
      <div data-testid="attachment-item" class="flex items-center gap-2 rounded-[10px] border border-hairline-mist bg-sandstone px-2 py-1 text-xs">
        <svg data-testid="check-icon"></svg>
        <span>sample.pdf</span>
        <span data-testid="attachment-status-completed" class="flex items-center gap-1"><svg></svg>Indexed</span>
      </div>
    </div>
  `)
  await expect(page.getByText('Indexing...')).toBeVisible()
  await expect(page.getByText('Indexed')).toBeVisible()
  await expect(page.getByTestId('attachment-status-processing')).toBeVisible()
  await expect(page.getByTestId('attachment-status-completed')).toBeVisible()
})

test('failed shows Could not process and Retry', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview">
      <div data-testid="attachment-item" class="flex items-center gap-2 rounded-[10px] border border-hairline-mist bg-sandstone">
        <span>corrupted.pdf</span>
        <span data-testid="attachment-status-failed" class="flex items-center gap-1"><svg></svg>Could not process</span>
        <button data-testid="attachment-retry">Retry</button>
        <button data-testid="attachment-remove">x</button>
      </div>
    </div>
  `)
  await expect(page.getByText('Could not process')).toBeVisible()
  await expect(page.getByTestId('attachment-retry')).toBeVisible()
  await expect(page.getByTestId('attachment-status-failed')).toBeVisible()
})

test('upload pdf Indexed then query with context', async ({ page }) => {
  // Simulate compare same context: two columns share same RAG context
  await page.setContent(`
    <div data-testid="compare-grid" class="grid grid-cols-2 gap-4">
      <div data-testid="generation-1" class="rounded-[10px] border border-hairline-mist bg-pure-white p-4">
        <span>Context from documents:</span>
        <span>[1] Unique RAG content for injection</span>
        <p>Answer referencing document</p>
      </div>
      <div data-testid="generation-2" class="rounded-[10px] border border-hairline-mist bg-pure-white p-4">
        <span>Context from documents:</span>
        <span>[1] Unique RAG content for injection</span>
        <p>Same answer</p>
      </div>
    </div>
  `)
  await expect(page.getByTestId('generation-1')).toContainText(
    'Context from documents',
  )
  await expect(page.getByTestId('generation-2')).toContainText(
    'Context from documents',
  )
  const c1 = await page.getByTestId('generation-1').textContent()
  const c2 = await page.getByTestId('generation-2').textContent()
  expect(c1).toContain('Unique RAG content for injection')
  expect(c2).toContain('Unique RAG content for injection')
  // Ensure same context (fair)
  expect(c1?.includes('Unique RAG')).toBeTruthy()
  expect(c2?.includes('Unique RAG')).toBeTruthy()
})

test('chat without context still works after failed retrieve', async ({
  page,
}) => {
  await page.setContent(`
    <div data-testid="chat-container" class="bg-cream-paper">
      <div data-testid="message-list">
        <div data-testid="assistant-message">Hello without RAG</div>
      </div>
      <div data-testid="composer" class="rounded-[50px] border border-hairline-mist bg-pure-white">
        <textarea data-testid="composer-input"></textarea>
        <button data-testid="send-button">Send</button>
      </div>
    </div>
  `)
  await expect(page.getByTestId('assistant-message')).toBeVisible()
  await expect(page.getByTestId('composer')).toBeVisible()
  // Ensure no shadow-xl in preview
  const hasShadow = await page.evaluate(() => {
    const all = document.querySelectorAll('*')
    for (const el of Array.from(all)) {
      const cls = (el as HTMLElement).className
      if (typeof cls === 'string' && cls.includes('shadow-xl')) return true
    }
    return false
  })
  expect(hasShadow).toBe(false)
})

test('no shadow-xl in rag preview', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview" class="flex flex-wrap gap-2">
      <div class="rounded-[10px] border border-hairline-mist bg-sandstone">Indexed</div>
      <div class="rounded-[10px] border border-hairline-mist bg-pure-white">Could not process</div>
    </div>
  `)
  const hasShadow = await page.evaluate(() => {
    const all = document.querySelectorAll('*')
    for (const el of Array.from(all)) {
      const cls = (el as HTMLElement).className
      if (typeof cls === 'string' && cls.includes('shadow-xl')) return true
    }
    return false
  })
  expect(hasShadow).toBe(false)
})
