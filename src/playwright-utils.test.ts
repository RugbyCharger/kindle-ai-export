import { describe, expect, it } from 'vitest'

import type { TocItem } from './types'
import { parsePageNav, parseTocItems } from './playwright-utils'

describe('parsePageNav', () => {
  it('parses "Page X of Y" format', () => {
    expect(parsePageNav('Page 42 of 300')).toEqual({ page: 42, total: 300 })
    expect(parsePageNav('page 1 of 100')).toEqual({ page: 1, total: 100 })
  })

  it('parses "Location X of Y" format', () => {
    expect(parsePageNav('Location 150 of 5000')).toEqual({
      location: 150,
      total: 5000
    })
  })

  it('parses roman numeral page format', () => {
    expect(parsePageNav('Page iv of 300')).toEqual({ location: 4, total: 300 })
    expect(parsePageNav('Page xii of 500')).toEqual({
      location: 12,
      total: 500
    })
  })

  it('returns undefined for null input', () => {
    expect(parsePageNav(null)).toBeUndefined()
  })

  it('returns undefined for unrecognized format', () => {
    expect(parsePageNav('something else')).toBeUndefined()
    expect(parsePageNav('')).toBeUndefined()
  })
})

const makeTocItem = (label: string, page: number, depth = 0): TocItem =>
  ({ label, positionId: page * 100, page, depth }) as TocItem

describe('parseTocItems', () => {
  it('finds first content page', () => {
    const toc = [
      makeTocItem('Title Page', 1),
      makeTocItem('Chapter 1', 5),
      makeTocItem('About the Author', 95)
    ]

    const result = parseTocItems(toc, { totalNumPages: 100 })
    expect(result.firstContentPageTocItem.label).toBe('Title Page')
  })

  it('detects post-content sections', () => {
    const toc = [
      makeTocItem('Chapter 1', 1),
      makeTocItem('Chapter 20', 80),
      makeTocItem('Acknowledgements', 95)
    ]

    const result = parseTocItems(toc, { totalNumPages: 100 })
    expect(result.firstPostContentPageTocItem?.label).toBe('Acknowledgements')
  })

  it('detects "About the Author" as post-content', () => {
    const toc = [
      makeTocItem('Chapter 1', 1),
      makeTocItem('About the Author', 92)
    ]

    const result = parseTocItems(toc, { totalNumPages: 100 })
    expect(result.firstPostContentPageTocItem?.label).toBe('About the Author')
  })

  it('returns undefined for post-content when none detected', () => {
    const toc = [
      makeTocItem('Chapter 1', 1),
      makeTocItem('Chapter 2', 50),
      makeTocItem('Final Chapter', 90)
    ]

    const result = parseTocItems(toc, { totalNumPages: 100 })
    expect(result.firstPostContentPageTocItem).toBeUndefined()
  })

  it('does not flag epilogue as post-content', () => {
    const toc = [makeTocItem('Chapter 1', 1), makeTocItem('Epilogue', 92)]

    const result = parseTocItems(toc, { totalNumPages: 100 })
    expect(result.firstPostContentPageTocItem).toBeUndefined()
  })
})
