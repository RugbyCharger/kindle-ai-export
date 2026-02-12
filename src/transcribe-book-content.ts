import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import delay from 'delay'
import { OpenAIClient } from 'openai-fetch'
import pMap from 'p-map'

import type { BookMetadata, ContentChunk, TocItem } from './types'
import { assert, escapeRegExp, getEnv, readJsonFile } from './utils'

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxRetries = 5,
    baseDelayMs = 1000
  }: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 503 ||
        err?.code === 'ECONNRESET'

      if (!isRetryable || attempt >= maxRetries) {
        throw err
      }

      const backoff = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000
      console.warn(
        `API error (status ${status}), retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})...`
      )
      await delay(backoff)
    }
  }
}

async function main() {
  const asin = getEnv('ASIN')
  assert(asin, 'ASIN is required')
  const concurrency = Number.parseInt(getEnv('CONCURRENCY') ?? '16', 10)

  const outDir = path.join('out', asin)
  const metadata = await readJsonFile<BookMetadata>(
    path.join(outDir, 'metadata.json')
  )
  assert(metadata.pages?.length, 'no page screenshots found')
  assert(metadata.toc?.length, 'invalid book metadata: missing toc')

  const pageToTocItemMap = metadata.toc.reduce(
    (acc, tocItem) => {
      if (tocItem.page !== undefined) {
        acc[tocItem.page] = tocItem
      }
      return acc
    },
    {} as Record<number, TocItem>
  )

  const openai = new OpenAIClient()

  const content: ContentChunk[] = (
    await pMap(
      metadata.pages,
      async (pageChunk, pageChunkIndex) => {
        const { screenshot, index, page } = pageChunk
        const screenshotBuffer = await fs.readFile(screenshot)
        const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString('base64')}`

        try {
          const maxRetries = 20
          let retries = 0

          do {
            const currentRetries = retries
            const res = await withRetry(() =>
              openai.createChatCompletion({
                model: 'gpt-4.1-mini',
                temperature: currentRetries < 2 ? 0 : 0.5,
                messages: [
                  {
                    role: 'system',
                    content: `You will be given an image containing text. Read the text from the image and output it verbatim.

Do not include any additional text, descriptions, or punctuation. Ignore any embedded images. Do not use markdown.`
                  },
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'image_url',
                        image_url: {
                          url: screenshotBase64
                        }
                      }
                    ] as any
                  }
                ]
              })
            )

            const rawText = res.choices[0]!.message.content!
            let text = rawText
              .replace(/^\s*\d+\s*$\n+/m, '')
              .replaceAll(/^\s*/gm, '')
              .replaceAll(/\s*$/gm, '')

            ++retries

            if (!text) continue
            if (text.length < 100 && /i'm sorry/i.test(text)) {
              if (retries >= maxRetries) {
                throw new Error(
                  `Model refused too many times (${retries} times): ${text}`
                )
              }

              // Sometimes the model refuses to generate text for an image
              // presumably if it thinks the content may be copyrighted or
              // otherwise inappropriate. I've seen this both "gpt-4o" and
              // "gpt-4o-mini", but it seems to happen more regularly with
              // "gpt-4o-mini". If we suspect a refual, we'll retry with a
              // higher temperature and cross our fingers.
              console.warn('retrying refusal...', { index, text, screenshot })
              continue
            }

            const prevPageChunk = metadata.pages[pageChunkIndex - 1]
            if (prevPageChunk && prevPageChunk.page !== page) {
              const tocItem = pageToTocItemMap[page]
              if (tocItem) {
                text = text.replace(
                  // eslint-disable-next-line security/detect-non-literal-regexp
                  new RegExp(`^${escapeRegExp(tocItem.label)}\\s*`, 'i'),
                  ''
                )
              }
            }

            const result: ContentChunk = {
              index,
              page,
              text,
              screenshot
            }
            console.log(result)

            return result
          } while (true)
        } catch (err) {
          console.error(`error processing image ${index} (${screenshot})`, err)
        }
      },
      { concurrency }
    )
  ).filter(Boolean)

  const droppedPages = metadata.pages.length - content.length
  if (droppedPages > 0) {
    console.warn(
      `WARNING: ${droppedPages} page(s) failed transcription and were skipped`
    )
  }

  await fs.writeFile(
    path.join(outDir, 'content.json'),
    JSON.stringify(content, null, 2)
  )
  console.log(JSON.stringify(content, null, 2))
}

await main()
