import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import PDFDocument from 'pdfkit'

import type { BookMetadata, ContentChunk } from './types'
import { assert, getEnv, iterateChapters, readJsonFile } from './utils'

async function main() {
  const asin = getEnv('ASIN')
  assert(asin, 'ASIN is required')

  const outDir = path.join('out', asin)

  const content = await readJsonFile<ContentChunk[]>(
    path.join(outDir, 'content.json')
  )
  const metadata = await readJsonFile<BookMetadata>(
    path.join(outDir, 'metadata.json')
  )
  assert(content.length, 'no book content found')
  assert(metadata.meta, 'invalid book metadata: missing meta')
  assert(metadata.toc?.length, 'invalid book metadata: missing toc')

  const title = metadata.meta.title
  const authors = metadata.meta.authorList

  const doc = new PDFDocument({
    autoFirstPage: true,
    displayTitle: true,
    info: {
      Title: title,
      Author: authors.join(', ')
    }
  })
  const stream = doc.pipe(fs.createWriteStream(path.join(outDir, 'book.pdf')))

  const fontSize = 12

  const renderTitlePage = () => {
    ;(doc as any).outline.addItem('Title Page')
    doc.fontSize(48)
    doc.y = doc.page.height / 2 - doc.heightOfString(title) / 2
    doc.text(title, { align: 'center' })
    const w = doc.widthOfString(title)

    const byline = `By ${authors.join(',\n')}`

    doc.fontSize(20)
    doc.y -= doc.heightOfString(byline) / 2
    doc.text(byline, {
      align: 'center',
      indent: w - doc.widthOfString(byline)
    })

    doc.addPage()
    doc.fontSize(fontSize)
  }

  renderTitlePage()

  let needsNewPage = false

  for (const { tocItem, text } of iterateChapters(metadata.toc, content)) {
    if (needsNewPage) {
      doc.addPage()
    }

    ;(doc as any).outline.addItem(tocItem.label)
    doc.fontSize(tocItem.depth === 1 ? 16 : 20)
    doc.text(tocItem.label, { align: 'center', lineGap: 16 })

    doc.fontSize(fontSize)
    doc.moveDown(1)

    doc.text(text, {
      indent: 20,
      lineGap: 4,
      paragraphGap: 8
    })

    needsNewPage = true
  }

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}

await main()
