import { expect, test, type Page } from '@playwright/test'

const start = new Date('2026-10-11T12:00:00.000Z')
const dueAt = new Date(start.getTime() + 60_000).toISOString()
const playerId = 'anon_a1b2c3d4'
const accessToken = 'ab'.repeat(32)
const parentId = 'p_0000000000020_loss001'
const childId = 'p_0000000000021_redeem1'
const offerId = `o_${parentId}`
const issued = start.toISOString()
const expires = new Date(start.getTime() + 10_000).toISOString()

type Phase = 'loss' | 'active' | 'won' | 'expired' | 'declined' | 'used' | 'replaced' | 'normal'

function offer(status: 'OPEN' | 'EXPIRED' | 'DECLINED' | 'ACCEPTED' | 'REPLACED') {
  return {
    offerId,
    parentPredictionId: parentId,
    mode: 'REDEMPTION',
    direction: null,
    payout: { win: 4, loss: -2, parentDelta: -1 },
    issuedAt: issued,
    expiresAt: expires,
    extensions: 0,
    status,
    bonusPredictionId: status === 'ACCEPTED' ? childId : undefined,
    ...(status === 'ACCEPTED' ? { chosenDirection: 'DOWN' } : {}),
  }
}

function parentSettled() {
  return {
    predictionId: parentId,
    playerId,
    direction: 'UP',
    mode: 'STANDARD',
    status: 'RESOLVED',
    createdAt: issued,
    dueAt,
    entryPrice: '70000.50',
    entryTradeTime: issued,
    resolvedAt: issued,
    resolutionPrice: '69900.00',
    resolutionTradeTime: issued,
    resolutionFetchedAt: issued,
    outcome: 'LOSS',
    scoreDelta: -1,
  }
}

function child(status: 'PENDING' | 'RESOLVED') {
  return {
    predictionId: childId,
    playerId,
    direction: 'DOWN',
    mode: 'REDEMPTION',
    parentPredictionId: parentId,
    status,
    createdAt: issued,
    dueAt,
    entryPrice: '69800.00',
    entryTradeTime: issued,
    ...(status === 'RESOLVED'
      ? {
          resolvedAt: issued,
          resolutionPrice: '69700.00',
          resolutionTradeTime: issued,
          resolutionFetchedAt: issued,
          outcome: 'WIN',
          scoreDelta: 4,
          parent: { predictionId: parentId, scoreDelta: -1 },
        }
      : {}),
  }
}

function normalPending() {
  return {
    predictionId: 'p_0000000000022_normal1',
    playerId,
    direction: 'UP',
    mode: 'STANDARD',
    status: 'PENDING',
    createdAt: issued,
    dueAt,
    entryPrice: '69850.00',
    entryTradeTime: issued,
  }
}

async function boot(page: Page, phase: { current: Phase }) {
  await page.clock.install({ time: start })
  await page.route('http://api.test/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.method() === 'POST' && path === '/players') {
      await json({ playerId, accessToken })
      return
    }
    if (request.method() === 'GET' && path === '/market') {
      await json({ price: '65432.10', source: 'COINBASE_EXCHANGE', fetchedAt: issued, tradeTime: issued, isFresh: true })
      return
    }
    if (request.method() === 'GET' && path === '/me') {
      const base = { playerId, losses: 1, serverTime: issued, features: { doubleDown: true, redemption: true } }
      const current = phase.current
      if (current === 'active') {
        await json({ ...base, score: -1, wins: 0, activePrediction: child('PENDING'), latestResolvedPrediction: parentSettled(), waitReason: 'WAITING_FOR_DEADLINE', offer: offer('ACCEPTED') })
        return
      }
      if (current === 'won') {
        await json({ ...base, score: 3, wins: 1, activePrediction: null, latestResolvedPrediction: child('RESOLVED'), waitReason: null, offer: null })
        return
      }
      if (current === 'expired') {
        await json({ ...base, score: -1, wins: 0, activePrediction: null, latestResolvedPrediction: parentSettled(), waitReason: null, offer: offer('EXPIRED') })
        return
      }
      if (current === 'declined') {
        await json({ ...base, score: -1, wins: 0, activePrediction: null, latestResolvedPrediction: parentSettled(), waitReason: null, offer: offer('DECLINED') })
        return
      }
      if (current === 'used') {
        await json({ ...base, score: -1, wins: 0, activePrediction: child('PENDING'), latestResolvedPrediction: parentSettled(), waitReason: 'WAITING_FOR_DEADLINE', offer: offer('ACCEPTED') })
        return
      }
      if (current === 'replaced' || current === 'normal') {
        await json({ ...base, score: -1, wins: 0, activePrediction: normalPending(), latestResolvedPrediction: parentSettled(), waitReason: 'WAITING_FOR_DEADLINE', offer: offer('REPLACED') })
        return
      }
      await json({ ...base, score: -1, wins: 0, activePrediction: null, latestResolvedPrediction: parentSettled(), waitReason: null, offer: offer('OPEN') })
      return
    }
    if (request.method() === 'GET' && path === '/predictions') {
      const predictions = phase.current === 'won' ? [child('RESOLVED'), parentSettled()] : [parentSettled()]
      await json({ predictions, nextCursor: null })
      return
    }
    if (request.method() === 'POST' && path === `/offers/${encodeURIComponent(offerId)}/accept`) {
      phase.current = 'active'
      await json(child('PENDING'), 201)
      return
    }
    if (request.method() === 'POST' && path === `/offers/${encodeURIComponent(offerId)}/decline`) {
      phase.current = 'declined'
      await json(offer('DECLINED'))
      return
    }
    if (request.method() === 'POST' && path === '/predictions') {
      phase.current = 'normal'
      await json(normalPending(), 201)
      return
    }
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('/')
}

test('plays a redemption round down and shows the pair', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await boot(page, phase)
  await expect(page.getByRole('heading', { name: 'Play one Redemption round?' })).toBeVisible()
  await expect(page.getByText('−1 kept')).toBeVisible()
  await expect(page.getByText('Pair total', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Play Down' }).click()
  await expect(page.getByRole('heading', { name: 'Your Redemption round is in' })).toBeVisible()
  phase.current = 'won'
  await page.clock.runFor(2_000)
  await expect(page.locator('#receipt-heading')).toHaveText('Redemption round correct')
  await expect(page.getByText('Pair total', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your rounds' })).toContainText('Redemption pair')
  await expect(page.getByRole('region', { name: 'Your rounds' })).toContainText('Pair +3')
})

test('ends the offer when the player waits or declines', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await boot(page, phase)
  await expect(page.getByRole('button', { name: 'Play Up' })).toBeVisible()
  phase.current = 'expired'
  await page.clock.runFor(2_000)
  await expect(page.getByText('Offer ended. Your −1 stands.')).toBeVisible()

  phase.current = 'loss'
  await page.reload()
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByText('No Redemption round. Your −1 stands.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Predict Bitcoin will go Up' })).toBeEnabled()
})

test('starts a normal round from the main Up button without a notice', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await boot(page, phase)
  await page.getByRole('button', { name: 'Predict Bitcoin will go Up' }).click()
  await expect(page.getByRole('heading', { name: 'Your prediction' })).toBeVisible()
  await expect(page.getByText('Offer no longer available')).toHaveCount(0)
})

test('shows the other-tab notice above the ticket', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await boot(page, phase)
  await expect(page.getByRole('button', { name: 'Play Down' })).toBeVisible()
  phase.current = 'used'
  await page.clock.runFor(2_000)
  await expect(page.getByText('already started in another tab')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your Redemption round is in' })).toBeVisible()
})

test('restores an open offer and an expired offer this tab has seen', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await boot(page, phase)
  await expect(page.getByRole('button', { name: 'Play Up' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Restored after refresh. Time left comes from our server.')).toBeVisible()
  phase.current = 'expired'
  await page.reload()
  await expect(page.getByText('Offer ended. Your −1 stands.')).toBeVisible()
})

test('fits the redemption actions on a narrow screen and uses pips when motion is reduced', async ({ page }) => {
  const phase = { current: 'loss' as Phase }
  await page.setViewportSize({ width: 375, height: 800 })
  await boot(page, phase)
  const up = page.getByRole('button', { name: 'Play Up' })
  const thanks = page.getByRole('button', { name: 'No thanks' })
  await expect(up).toBeVisible()
  await expect(thanks).toBeVisible()
  const upBox = await up.boundingBox()
  const thanksBox = await thanks.boundingBox()
  expect(upBox && thanksBox && thanksBox.width > upBox.width + 40).toBe(true)
  expect(upBox && upBox.height >= 44).toBe(true)
  await expect(page.getByRole('region', { name: 'Your score' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const pips = await page.locator('.dd-pips').evaluate((node) => getComputedStyle(node).display)
  expect(pips).toBe('flex')
})
