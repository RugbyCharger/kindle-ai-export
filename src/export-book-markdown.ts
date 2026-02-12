import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

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

  const chapters = [...iterateChapters(metadata.toc, content)]

  const tocMarkdown = chapters
    .map(
      ({ tocItem }) =>
        `${'  '.repeat(tocItem.depth)}- [${tocItem.label}](#${tocItem.label.toLowerCase().replaceAll(/[^\da-z]+/g, '-')})`
    )
    .join('\n')

  let output = `# ${title}

> By ${authors.join(', ')}

---

## Table of Contents

${tocMarkdown}

---`

  for (const { tocItem, text } of chapters) {
    output += `

${'#'.repeat(tocItem.depth + 2)} ${tocItem.label}

${text.replaceAll('\n', '\n\n')}`
  }

  await fs.writeFile(path.join(outDir, 'book.md'), output)
  console.log(output)
}

await main()
