import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillSelector } from '../../src/components/chat/SkillSelector'

describe('SkillSelector Compare Guard', () => {
  afterEach(() => {
    cleanup()
  })

  it('allows selecting prd-plan when compare mode is disabled', () => {
    const onChange = vi.fn()
    render(<SkillSelector value="none" onChange={onChange} compareEnabled={false} />)

    const trigger = screen.getByTestId('skill-selector-trigger')
    fireEvent.click(trigger)

    const prdOption = screen.getByTestId('skill-option-prd-plan')
    expect(prdOption.hasAttribute('disabled')).toBe(false)
    fireEvent.click(prdOption)
    expect(onChange).toHaveBeenCalledWith('prd-plan')
  })

  it('blocks prd-plan when compare mode is enabled', () => {
    const onChange = vi.fn()
    render(<SkillSelector value="none" onChange={onChange} compareEnabled={true} />)

    const trigger = screen.getByTestId('skill-selector-trigger')
    fireEvent.click(trigger)

    const prdOption = screen.getByTestId('skill-option-prd-plan')
    expect(prdOption.hasAttribute('disabled')).toBe(true)
    expect(prdOption.textContent).toContain('Single Only')
    expect(prdOption.textContent).toContain('Tidak tersedia di Compare Mode')

    fireEvent.click(prdOption)
    expect(onChange).not.toHaveBeenCalled()
  })
})
