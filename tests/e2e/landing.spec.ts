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
  await expect(page.locator('input[type="password"]')).toHaveCount(0)

  const font = await page.locator('body').evaluate(async (body) => {
    await document.fonts.ready
    const family = getComputedStyle(body)
      .fontFamily.split(',')[0]
      .trim()
      .replaceAll(/["']/g, '')

    return {
      family,
      loaded: document.fonts.check(`16px "${family}"`),
    }
  })
  expect(font.family).toBe('Inter')
  expect(font.loaded).toBe(true)
})
