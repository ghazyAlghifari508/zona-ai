import { expect, test } from '@playwright/test'

test('landing renders the cream canvas and floating navigation', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: /Zona\.ai/ }),
  ).toBeVisible()

  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(245, 241, 228)',
  )
  await expect(page.getByRole('navigation')).toHaveCSS('border-radius', '50px')

  const fontFamily = await page
    .locator('body')
    .evaluate((body) =>
      getComputedStyle(body)
        .fontFamily.split(',')[0]
        .trim()
        .replaceAll(/["']/g, ''),
    )
  expect(fontFamily).toBe('Inter')
})
