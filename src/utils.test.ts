import { describe, expect, it } from 'vitest'

import type { ContentChunk, TocItem } from './types'
import {
  assert,
  deromanize,
  escapeRegExp,
  iterateChapters,
  normalizeAuthors,
  parseJsonpResponse
} from './utils'

describe('assert', () => {
  it('does not throw for truthy values', () => {
    expect(() => assert(true)).not.toThrow()
    expect(() => assert(1)).not.toThrow()
    expect(() => assert('hello')).not.toThrow()
  })

  it('throws for falsy values', () => {
    expect(() => assert(false)).toThrow('Assertion failed')
    expect(() => assert(null)).toThrow('Assertion failed')
    expect(() => assert(0)).toThrow('Assertion failed')
    expect(() => assert('')).toThrow('Assertion failed')
  })

  it('throws with custom message', () => {
    expect(() => assert(false, 'custom error')).toThrow('custom error')
  })

  it('throws provided Error instance', () => {
    const err = new TypeError('type error')
    expect(() => assert(false, err)).toThrow(err)
  })
})

describe('deromanize', () => {
  it('converts basic roman numerals', () => {
    expect(deromanize('I')).toBe(1)
    expect(deromanize('V')).toBe(5)
    expect(deromanize('X')).toBe(10)
    expect(deromanize('L')).toBe(50)
    expect(deromanize('C')).toBe(100)
    expect(deromanize('D')).toBe(500)
    expect(deromanize('M')).toBe(1000)
  })

  it('converts compound roman numerals', () => {
    expect(deromanize('II')).toBe(2)
    expect(deromanize('III')).toBe(3)
    expect(deromanize('IV')).toBe(4)
    expect(deromanize('IX')).toBe(9)
    expect(deromanize('XIV')).toBe(14)
    expect(deromanize('XL')).toBe(40)
    expect(deromanize('XLII')).toBe(42)
    expect(deromanize('XC')).toBe(90)
    expect(deromanize('XCIX')).toBe(99)
    expect(deromanize('CD')).toBe(400)
    expect(deromanize('CM')).toBe(900)
    expect(deromanize('MCMXCIX')).toBe(1999)
    expect(deromanize('MMXXV')).toBe(2025)
  })

  it('handles lowercase input', () => {
    expect(deromanize('iv')).toBe(4)
    expect(deromanize('xlii')).toBe(42)
    expect(deromanize('mcmxcix')).toBe(1999)
  })
})

describe('normalizeAuthors', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeAuthors([])).toEqual([])
  })

  it('reverses last, first format', () => {
    expect(normalizeAuthors(['Reynolds, Alastair'])).toEqual([
      'Alastair Reynolds'
    ])
  })

  it('handles colon-separated author lists', () => {
    expect(normalizeAuthors(['Reynolds, Alastair:Banks, Iain M.'])).toEqual([
      'Alastair Reynolds',
      'Iain M. Banks'
    ])
  })

  it('deduplicates authors', () => {
    expect(normalizeAuthors(['Reynolds, Alastair:Reynolds, Alastair'])).toEqual(
      ['Alastair Reynolds']
    )
  })
})

describe('parseJsonpResponse', () => {
  it('extracts JSON from JSONP callback', () => {
    const body = 'callback({"asin":"B123","title":"Test Book"})'
    const result = parseJsonpResponse<{ asin: string; title: string }>(body)
    expect(result).toEqual({ asin: 'B123', title: 'Test Book' })
  })

  it('returns undefined for non-JSONP input', () => {
    expect(parseJsonpResponse('not jsonp')).toBeUndefined()
    expect(parseJsonpResponse('')).toBeUndefined()
  })

  it('returns undefined for invalid JSON inside JSONP', () => {
    expect(parseJsonpResponse('callback({invalid})')).toBeUndefined()
  })
})

describe('escapeRegExp', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegExp('Chapter (1)')).toBe('Chapter \\(1\\)')
    expect(escapeRegExp('Part [A]')).toBe('Part \\[A\\]')
    expect(escapeRegExp('What?')).toBe('What\\?')
    expect(escapeRegExp('a.b*c+d')).toBe('a\\.b\\*c\\+d')
    expect(escapeRegExp('$100')).toBe('\\$100')
  })

  it('leaves normal strings unchanged', () => {
    expect(escapeRegExp('Chapter 1')).toBe('Chapter 1')
    expect(escapeRegExp('Prologue')).toBe('Prologue')
  })
})

const makeTocItem = (label: string, page: number, depth = 0): TocItem =>
  ({ label, positionId: page * 100, page, depth }) as TocItem

const makeChunk = (
  index: number,
  page: number,
  text: string
): ContentChunk => ({
  index,
  page,
  text,
  screenshot: `pages/${index}.png`
})

describe('iterateChapters', () => {
  it('yields chapters with their content', () => {
    const toc = [
      makeTocItem('Chapter 1', 1),
      makeTocItem('Chapter 2', 3),
      makeTocItem('End', 5)
    ]
    const content = [
      makeChunk(0, 1, 'Page one'),
      makeChunk(1, 2, 'Page two'),
      makeChunk(2, 3, 'Page three'),
      makeChunk(3, 4, 'Page four'),
      makeChunk(4, 5, 'End page')
    ]

    const chapters = [...iterateChapters(toc, content)]
    expect(chapters).toHaveLength(2)
    expect(chapters[0]!.tocItem.label).toBe('Chapter 1')
    expect(chapters[0]!.text).toBe('Page one Page two')
    expect(chapters[0]!.chunks).toHaveLength(2)
    expect(chapters[1]!.tocItem.label).toBe('Chapter 2')
    expect(chapters[1]!.text).toBe('Page three Page four')
  })

  it('returns empty for single-item toc', () => {
    const toc = [makeTocItem('Only', 1)]
    const content = [makeChunk(0, 1, 'text')]
    expect([...iterateChapters(toc, content)]).toHaveLength(0)
  })

  it('skips toc items without pages', () => {
    const tocWithoutPage = {
      label: 'No Page',
      positionId: 50,
      depth: 0,
      location: 5
    } as TocItem

    const toc = [
      tocWithoutPage,
      makeTocItem('Chapter 1', 1),
      makeTocItem('End', 3)
    ]
    const content = [
      makeChunk(0, 1, 'Page one'),
      makeChunk(1, 2, 'Page two'),
      makeChunk(2, 3, 'End page')
    ]

    const chapters = [...iterateChapters(toc, content)]
    expect(chapters).toHaveLength(1)
    expect(chapters[0]!.tocItem.label).toBe('Chapter 1')
  })
})
