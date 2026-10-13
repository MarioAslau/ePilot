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
    await expect(page.locator('.ch-line')).toHaveAttribute('points', /\d/)
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
    expect(overflow, fixture).toBeLessThanOrEqual(0)
  }
})
