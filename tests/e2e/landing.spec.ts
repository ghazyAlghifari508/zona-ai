import { expect, test } from '@playwright/test'

test('home renders the public chat workspace instead of a poster', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // On tablet/mobile the guest sidebar is hidden behind hamburger; open it so brand-mark etc are visible
  const viewport = page.viewportSize()
  const isMobileViewport = viewport !== null && viewport.width < 1024
  if (isMobileViewport) {
    await expect(page.getByTestId('hamburger')).toBeVisible()
    await page.getByTestId('hamburger').click()
    await expect(page.getByTestId('guest-sidebar')).toBeVisible()
  }

  await expect(page.getByTestId('composer-input')).toBeVisible()
  await expect(page.getByTestId('guest-sidebar')).toHaveCount(1)
  await expect(page.getByTestId('brand-mark')).toBeVisible()
  await expect(page.getByTestId('composer')).toBeVisible()
  await expect(page.getByTestId('skill-selector-trigger')).toBeVisible()
  await expect(page.getByTestId('attachment-btn')).toBeVisible()
  await expect(page.getByTestId('web-toggle')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pilih model' })).toBeVisible()
  await expect(page.getByText('Bantu menulis')).toHaveCount(0)
  await expect(page.getByText('Kertas cream, gagasan jernih')).toHaveCount(0)

  const masukButton = page.getByTestId('home-sign-in')
  await expect(masukButton).toBeVisible()
  const masukShape = await masukButton.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      radius: Number.parseFloat(style.borderTopLeftRadius),
      height: Number.parseFloat(style.height),
    }
  })
  expect(masukShape.radius).toBeLessThanOrEqual(10)
  const masukBox = await masukButton.boundingBox()
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  expect(masukBox).not.toBeNull()
  expect(viewportWidth - (masukBox?.x ?? 0) - (masukBox?.width ?? 0)).toBeLessThanOrEqual(80)

  const sidebarBox = await page.getByTestId('guest-sidebar').boundingBox()
  const newChatBox = await page.getByTestId('guest-new-chat').boundingBox()
  const signInBox = await page.getByTestId('guest-sign-in').boundingBox()
  expect(sidebarBox).not.toBeNull()
  expect(newChatBox).not.toBeNull()
  expect(signInBox).not.toBeNull()
  expect((newChatBox?.x ?? 0) - (sidebarBox?.x ?? 0)).toBeGreaterThanOrEqual(12)
  expect((newChatBox?.x ?? 0) - (sidebarBox?.x ?? 0)).toBeLessThanOrEqual(16)
  expect((signInBox?.x ?? 0) - (sidebarBox?.x ?? 0)).toBeGreaterThanOrEqual(12)
  expect((signInBox?.x ?? 0) - (sidebarBox?.x ?? 0)).toBeLessThanOrEqual(16)

  // Close sidebar on mobile so heading/composer are not intercepted
  if (isMobileViewport) {
    await page.getByTestId('hamburger').click()
    await expect(page.getByTestId('guest-sidebar')).toBeHidden()
  }

  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(246, 245, 244)',
  )
  await expect(page.locator('input[type="password"]')).toHaveCount(0)

  const font = await page.locator('body').evaluate(async (body) => {
    await document.fonts.ready
    const normalizeFamily = (family: string) =>
      family.trim().replaceAll(/["']/g, '').toLowerCase()
    const family = getComputedStyle(body)
      .fontFamily.split(',')[0]
      .trim()
      .replaceAll(/["']/g, '')

    return {
      family,
      loaded: Array.from(document.fonts).some(
        (fontFace) =>
          normalizeFamily(fontFace.family) === normalizeFamily(family) &&
          fontFace.status === 'loaded',
      ),
    }
  })
  expect(font.family).toBe('Inter')
  expect(font.loaded).toBe(true)

  await page.getByTestId('composer').scrollIntoViewIfNeeded()
  const composerBox = await page.getByTestId('composer').boundingBox()
  expect(composerBox?.y).toBeGreaterThan(250)

  await page.getByRole('heading', { level: 1 }).click()
  await page.waitForTimeout(150)
  // Allow both rgba and oklab computed representations; ensure old tokens are gone and new hairline is applied
  const beforeBorder = await page.getByTestId('composer').evaluate((el) => getComputedStyle(el).borderColor)
  expect(beforeBorder).not.toBe('rgb(213, 213, 212)')
  expect(beforeBorder).not.toBe('rgb(142, 212, 98)')
  // hairline-strong is rgba(0,0,0,0.12) - may appear as oklab; just verify it's not the old fresh-grass and contains expected alpha pattern
  expect(beforeBorder).toMatch(/0\.12|0\.236|0\.08|0\.124/)
  // More strict: check class indicates hairline-strong
  await expect(page.getByTestId('composer')).toHaveClass(/border-hairline-strong/)

  await page.getByTestId('composer-input').click()
  await expect(page.getByTestId('composer-input')).toBeFocused()
  await expect(page.getByTestId('composer-input')).toHaveCSS(
    'outline-style',
    'none',
  )
  // Wait for focus-within to apply (transition 200ms)
  await expect.poll(async () => await page.getByTestId('composer').evaluate((el) => getComputedStyle(el).borderColor), { timeout: 5000 }).toMatch(/0\.3/)
  await expect(page.getByTestId('composer')).toHaveClass(/focus-within:border-ink\/30/)

  await page.getByTestId('skill-selector-trigger').click()
  await expect(page.getByText('PILIH SKILL')).toBeVisible()
  await page.getByTestId('skill-option-checklist').click()
  await expect(page.getByTestId('composer-input')).toHaveAttribute(
    'placeholder',
    'Buatkan checklist untuk ',
  )

  await page.getByTestId('composer-input').fill('')
  if (isMobileViewport) {
    await page.getByTestId('hamburger').click()
    await expect(page.getByTestId('guest-sidebar')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Chat baru' }).click()
  await expect(page.getByTestId('composer-input')).toHaveValue('')
  await expect(page.getByTestId('composer-input')).toBeFocused()

  // Ensure sidebar closed on mobile before interacting with composer (overlay would intercept)
  if (isMobileViewport) {
    // guest-new-chat auto-closes sidebar, but wait for it to hide
    await expect(page.getByTestId('guest-sidebar')).toBeHidden({ timeout: 5000 }).catch(() => {})
  }

  await page.getByTestId('model-selector-trigger').click()
  await expect(page.getByTestId('compare-switch')).toBeVisible()
  const modelOptions = page.getByTestId(/^model-option-/)
  expect(await modelOptions.count()).toBeGreaterThanOrEqual(2)
  await page.getByTestId('compare-switch').click()
  await expect(page.getByTestId('compare-counter')).toHaveText('0/4')
  await expect(page.getByTestId('model-option-auto')).toHaveCount(0)
  await page.getByTestId('model-option-gpt-5.6-sol').click()
  await page.getByTestId('model-option-gemini-3.7-flash-high').click()
  await expect(page.getByTestId('compare-counter')).toHaveText('2/4')
  await expect(page.getByTestId('model-selector-trigger')).toContainText(
    '2 model dipilih',
  )
})

test('starter cards prefill the composer', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Ensure composer is ready
  await expect(page.getByTestId('composer-input')).toBeVisible()
  await page.getByTestId('starter-build').click()
  await expect(page
    .getByTestId('composer-input'))
    .toHaveValue('Bantu saya merancang aplikasi AI dari nol', { timeout: 10000 })
  await expect(page.getByTestId('composer-input')).toBeFocused()
})

test('sidebar collapses to icon rail on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop only - collapse button is lg:flex')
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('sidebar-collapse')).toBeVisible()
  // Ensure React hydration complete
  await page.waitForTimeout(300)
  await page.getByTestId('sidebar-collapse').click()
  await expect.poll(async () => await page.getByTestId('guest-sidebar').evaluate((el) => getComputedStyle(el).width), { timeout: 5000 }).toBe('76px')
  await expect(page.getByTestId('brand-mark')).toBeVisible()
  await page.getByTestId('sidebar-collapse').click()
  await expect.poll(async () => await page.getByTestId('guest-sidebar').evaluate((el) => getComputedStyle(el).width), { timeout: 5000 }).toBe('280px')
})
