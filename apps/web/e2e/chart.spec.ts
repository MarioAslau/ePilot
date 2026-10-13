import { expect, test } from '@playwright/test'

// Fixture previews render the real chart with seeded samples and need no API.
for (const { fixture, direction, win } of [
  { fixture: 'dd-active', direction: 'Up', win: 'above' },
  { fixture: 'rd-active', direction: 'Down', win: 'below' },
]) {
  test(`fills the winning side of the entry for a ${direction} call`, async ({ page }) => {
    await page.goto(`/?fixture=${fixture}`)
    const winZone = page.locator('[data-zone="win"]')
    await expect(winZone).toHaveAttribute('data-side', win)
    await expect(winZone).toHaveAttribute('d', /^M/)
    await expect(page.locator('[data-zone="lose"]')).toHaveAttribute('data-side', win === 'above' ? 'below' : 'above')
    await expect(page.getByText(`${direction} wins ${win}`)).toBeVisible()
  })
}

test('the stage does not scroll sideways at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const fixture of ['ready', 'active', 'checking', 'rd-active']) {
    await page.goto(`/?fixture=${fixture}`)
    await expect(page.locator('.ch-line')).toHaveAttribute('d', /^M/)
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
    expect(overflow, fixture).toBeLessThanOrEqual(0)
  }
})

test('hatches a gap in the feed and labels it', async ({ page }) => {
  await page.goto('/?fixture=feed-gap')
  await expect(page.getByText('No price data').first()).toBeVisible()
  // The line is split into two runs instead of being joined across the gap.
  await expect(page.locator('.ch-line')).toHaveAttribute('d', /^M[^M]+M[^M]+$/)
})

test('a settled round marks the compared trade at its trade time and freezes', async ({ page }) => {
  await page.goto('/?fixture=win')
  const stage = page.locator('.stage-market .spark > svg')
  const marker = stage.locator('[data-compared]')
  await expect(marker).toBeVisible()
  const width = Number(await stage.getAttribute('width'))
  const x = Number((await marker.getAttribute('transform'))!.match(/translate\(([\d.]+)/)![1])
  // Fixture: entry at 0 s, earliest result at 60 s, compared trade at 75 s.
  // Frozen like a live round 10 s after the compared trade: the 115 s window slid to [-30 s, 85 s],
  // so the marker sits at 105 / 115 of the width.
  expect(Math.abs(x - (width * 105) / 115)).toBeLessThanOrEqual(1)
  await expect(page.getByText(/^Compared \$65,901\.33 · /)).toBeVisible()
  await expect(page.locator('.mini-chart [data-compared]')).toBeVisible()
})

test('after a reload the receipt draws entry and compared price, not a series', async ({ page }) => {
  await page.goto('/?fixture=win-reload')
  await expect(page.locator('.mini-chart figcaption')).toHaveText('Entry and compared price')
  await expect(page.locator('.mini-chart .ch-connector')).toBeVisible()
})
