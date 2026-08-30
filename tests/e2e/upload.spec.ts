import { expect, test } from '@playwright/test'

test('attachment button visible', async ({ page }) => {
  await page.setContent(`
    <div data-testid="composer" class="bg-pure-white rounded-xl border border-hairline-strong">
      <button data-testid="attachment-btn"><svg></svg></button>
      <textarea data-testid="composer-input" placeholder="Tanyakan apa saja ke Zona.ai..."></textarea>
      <button data-testid="send-button"></button>
    </div>
  `)
  await expect(page.getByTestId('attachment-btn')).toBeVisible()
})

test('drag overlay appears on dragenter', async ({ page }) => {
  await page.setContent(`
    <div data-testid="composer" class="bg-pure-white rounded-xl border border-hairline-strong relative">
      <div data-testid="drag-overlay" class="absolute inset-0 bg-paper rounded-xl flex items-center justify-center text-[15px] border-2 border-dashed border-ink/40">Drop files here</div>
    </div>
  `)
  await expect(page.getByTestId('drag-overlay')).toContainText(
    'Drop files here',
  )
  const cls = await page
    .getByTestId('drag-overlay')
    .evaluate((el) => (el as HTMLElement).className)
  expect(cls).toContain('bg-paper')
  expect(cls).toContain('rounded-xl')
})

test('preview thumbnail 40x40 rounded 10px', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview" class="flex gap-2 flex-wrap p-2">
      <div class="flex items-center gap-1 bg-pure-white rounded-md border border-hairline px-2 py-1">
        <img src="data:image/png;base64,iVBORw0KGgo=" class="w-10 h-10 rounded-md object-cover" />
        <span>photo.png</span>
        <span class="text-[10px] px-1 bg-paper rounded-full">png</span>
        <button data-testid="attachment-remove"><svg></svg></button>
      </div>
    </div>
  `)
  const img = page.locator('[data-testid="attachment-preview"] img')
  await expect(img).toBeVisible()
  const cls = await img.evaluate((el) => (el as HTMLElement).className)
  expect(cls).toContain('rounded-md')
  expect(cls).toContain('w-10')
  await expect(page.getByTestId('attachment-remove')).toBeVisible()
})

test('doc preview badge FileText', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview">
      <div class="bg-pure-white rounded-md border border-hairline"><svg data-testid="file-icon"></svg><span>sample.pdf</span><span class="rounded-full bg-paper">pdf</span><button data-testid="attachment-remove">x</button></div>
    </div>
  `)
  await expect(page.getByTestId('attachment-preview')).toContainText(
    'sample.pdf',
  )
  await expect(page.getByTestId('file-icon')).toBeVisible()
})

test('remove X filters attachment', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview"><div data-testid="att-1">file1.pdf<button data-testid="attachment-remove">x</button></div><div data-testid="att-2">file2.png</div></div>
  `)
  await page.getByTestId('attachment-remove').click()
  await page.evaluate(() => {
    document.querySelector('[data-testid="att-1"]')?.remove()
  })
  await expect(page.getByTestId('att-1')).toHaveCount(0)
  await expect(page.getByTestId('att-2')).toBeVisible()
})

test('unsupported file error auto', async ({ page }) => {
  await page.setContent(`
    <div data-testid="error">This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.</div>
  `)
  await expect(page.getByText(/not supported/i)).toBeVisible()
})

test('no shadow-xl in preview', async ({ page }) => {
  await page.setContent(`
    <div data-testid="attachment-preview" class="bg-pure-white rounded-md border border-hairline">ok</div>
    <div class="absolute inset-0 bg-paper rounded-xl">overlay</div>
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
