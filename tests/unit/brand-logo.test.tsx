import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrandLogo } from '../../src/components/ui/BrandLogo'

describe('BrandLogo component', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders both light and dark mode images inside brand mark container', () => {
    const { container } = render(
      <BrandLogo data-testid="brand-mark" size={32} className="h-8 w-8" />,
    )

    const brandMark = screen.getByTestId('brand-mark')
    expect(brandMark).toBeTruthy()

    const images = container.querySelectorAll('img')
    expect(images.length).toBe(2)

    const lightImg = images[0]
    const darkImg = images[1]

    // Light mode logo
    expect(lightImg?.getAttribute('src')).toBe('/assets/zonaai-logo.png')
    expect(lightImg?.className).toContain('dark:hidden')

    // Dark mode logo
    expect(darkImg?.getAttribute('src')).toBe('/assets/zonaai-logo-white.png')
    expect(darkImg?.className).toContain('dark:block')
  })

  it('forwards custom size and alt attributes correctly', () => {
    const { container } = render(
      <BrandLogo size={48} alt="Custom Zona Logo" className="custom-class" />,
    )

    const images = container.querySelectorAll('img')
    expect(images[0]?.getAttribute('alt')).toBe('Custom Zona Logo')
    expect(images[0]?.getAttribute('width')).toBe('48')
    expect(images[1]?.getAttribute('alt')).toBe('Custom Zona Logo')
    expect(images[1]?.getAttribute('width')).toBe('48')
  })
})
