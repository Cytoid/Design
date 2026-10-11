import { describe, expect, it } from 'vitest'
import { drawText, measureText } from '../src'

describe('drawText glyph coverage', () => {
  it('renders every digit and %', () => {
    for (const text of ['0123456789', '%', 'COMBO', '100.00%', '.']) {
      const node = drawText(text, 40, '#ffffff')
      expect(node.type).toBe('group')
    }
  })

  it('renders the decimal point (regression: accuracy lost its dot)', () => {
    const node = drawText('97.50%', 40, '#ffffff')
    expect(node.type).toBe('group')
    // 6 glyphs → 6 child groups
    expect(node.type === 'group' && node.children.length).toBe(6)
    expect(measureText('9750%', 40)).toBeLessThan(measureText('97.50%', 40))
  })

  it('skips unknown glyphs without crashing', () => {
    const node = drawText('a?', 40, '#ffffff')
    expect(node.type).toBe('group')
  })

  it('measures text with the same metrics as drawText', () => {
    const H = 50
    expect(measureText('123', H)).toBeGreaterThan(0)
    expect(measureText('1', H)).toBeLessThan(measureText('123', H))
    expect(measureText('', H)).toBe(0)
    // digits share the letter width
    expect(measureText('00', H)).toBeCloseTo(measureText('PP', H))
  })
})
