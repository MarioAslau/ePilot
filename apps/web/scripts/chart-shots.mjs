/* global process, console, document, window */
// Screenshots of the stage card for chart review. Not part of CI.
// Usage: node scripts/chart-shots.mjs <outDir> [baseUrl] [fixture ...]
// Needs a dev server for the fixture pages, e.g. `npx vite --port 4174 --strictPort --open false`.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [outDir, baseUrl = 'http://localhost:4174', ...names] = process.argv.slice(2)
if (!outDir) throw new Error('usage: chart-shots.mjs <outDir> [baseUrl] [fixture ...]')
const fixtures = names.length ? names : ['ready', 'active', 'checking', 'equal-price', 'provider-hold', 'dd-active', 'win', 'loss']
const widths = [375, 1280]

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
const problems = []
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  for (const name of fixtures) {
    await page.goto(`${baseUrl}/?fixture=${name}`)
    const stage = page.locator('[data-layout-slot="stage"]')
    await stage.waitFor()
    await page.addStyleTag({ content: '.fixture-banner { display: none !important }' })
    await page.waitForTimeout(700)
    await stage.screenshot({ path: join(outDir, `${name}-${width}.png`) })
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
    if (overflow > 0) problems.push(`${name} @${width}: ${overflow}px horizontal overflow`)
  }
  await page.close()
}
await browser.close()
console.log(problems.length ? problems.join('\n') : `ok: ${fixtures.length * widths.length} shots in ${outDir}, no horizontal overflow`)
