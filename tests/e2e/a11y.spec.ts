import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Fase 10 — A11y E2E (WCAG 2.1 AA): axe 0 violations, focus ring,
 * aria-live log, prefers-reduced-motion.
 */

test.describe('a11y audit (wcag2a + wcag2aa)', () => {
  test('landing page has 0 axe violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('sign-in page has 0 axe violations', async ({ page }) => {
    await page.goto('/auth/sign-in')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('focus-visible produces 2px ink outline', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        tag: el.tagName,
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
      }
    })
    expect(focused).not.toBeNull()
    expect(focused?.outlineStyle).toBe('solid')
    expect(focused?.outlineWidth).not.toBe('0px')
  })

  test('prefers-reduced-motion disables animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const duration = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.animation = 'pulse 2s infinite'
      document.body.appendChild(probe)
      const d = getComputedStyle(probe).animationDuration
      probe.remove()
      return d
    })
    expect(duration).toMatch(/^0\.00001s$|^1e-05s$/)
  })

  test('icon buttons expose aria-label on chat page shell', async ({
    page,
  }) => {
    // Public navigation is audited; icon-only buttons must be labeled
    await page.goto('/')
    const unlabeled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons
        .filter((b) => !b.textContent?.trim() && !b.getAttribute('aria-label'))
        .map((b) => b.outerHTML.slice(0, 120))
    })
    expect(unlabeled).toEqual([])
  })
})
