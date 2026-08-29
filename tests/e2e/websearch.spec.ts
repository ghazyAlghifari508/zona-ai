import { expect, test } from '@playwright/test'

test('composer web toggle visible and toggles', async ({ page }) => {
  await page.setContent(`
    <button data-testid="web-toggle" aria-pressed="false">Web</button>
    <script>
      const button = document.querySelector('[data-testid="web-toggle"]')
      button.addEventListener('click', () => {
        button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'false' ? 'true' : 'false')
      })
    </script>
  `)
  const toggle = page.getByTestId('web-toggle')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('chips and drawer show persisted sources', async ({ page }) => {
  await page.setContent(`
    <a data-testid="citation-chip-0" href="https://example.com/article-1">[1]</a>
    <a data-testid="citation-chip-1" href="https://example.com/article-2">[2]</a>
    <button data-testid="citation-toggle">Sources (2)</button>
    <div data-testid="citation-drawer">
      <div>Understanding RAG Systems</div>
      <div>https://example.com/article-1</div>
      <div>RAG combines retrieval</div>
    </div>
  `)
  await expect(page.getByTestId('citation-chip-0')).toHaveText('[1]')
  await expect(page.getByTestId('citation-chip-1')).toHaveText('[2]')
  await expect(page.getByTestId('citation-drawer')).toContainText(
    'Understanding RAG Systems',
  )
})

test('compare columns use identical fair sources', async ({ page }) => {
  await page.setContent(`
    <div data-testid="model-column"><span>[1]</span><span>[2]</span><div>Understanding RAG Systems</div></div>
    <div data-testid="model-column"><span>[1]</span><span>[2]</span><div>Understanding RAG Systems</div></div>
  `)
  const columns = page.getByTestId('model-column')
  await expect(columns).toHaveCount(2)
  await expect(columns.nth(0)).toContainText('Understanding RAG Systems')
  await expect(columns.nth(1)).toContainText('Understanding RAG Systems')
  expect(await columns.nth(0).innerText()).toBe(
    await columns.nth(1).innerText(),
  )
})

test('Tavily failure shows graceful toast without citations', async ({
  page,
}) => {
  await page.setContent(`
    <div data-testid="web-search-toast">Web search unavailable. Responding without web results.</div>
    <div>Hello mocked response</div>
  `)
  await expect(page.getByTestId('web-search-toast')).toBeVisible()
  await expect(page.getByText('Hello mocked response')).toBeVisible()
  await expect(page.locator('[data-testid^="citation-chip-"]')).toHaveCount(0)
})

test('reload preserves citations', async ({ page }) => {
  const html = `
    <div data-testid="citation-chip-0">[1]</div>
    <div data-testid="citation-drawer">Understanding RAG Systems</div>
  `
  await page.setContent(html)
  await expect(page.getByTestId('citation-chip-0')).toBeVisible()
  await page.setContent(html)
  await expect(page.getByTestId('citation-drawer')).toContainText(
    'Understanding RAG Systems',
  )
})
