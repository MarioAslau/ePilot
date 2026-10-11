import { expect, test } from '@playwright/test'

const start = new Date('2026-10-11T12:00:00.000Z')
const dueAt = new Date(start.getTime() + 60_000).toISOString()
const playerId = 'anon_a1b2c3d4'
const accessToken = 'ab'.repeat(32)
const firstId = 'p_0000000000001_abcd1234'
const secondId = 'p_0000000000002_abcd5678'

test('plays one round and can place another', async ({ page }) => {
  let playerPosts = 0
  let serverNow = start.toISOString()
  let phase: 'ready' | 'active' | 'settled' | 'second' = 'ready'
  let releaseCreate: () => void = () => undefined
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve
  })
  let heldCreate = false

  function pending(id: string) {
    return {
      predictionId: id,
      playerId,
      direction: 'UP',
      mode: 'STANDARD',
      status: 'PENDING',
      createdAt: start.toISOString(),
      dueAt,
      entryPrice: '70000.50',
      entryTradeTime: start.toISOString(),
    }
  }

  function settled() {
    return {
      ...pending(firstId),
      status: 'RESOLVED',
      resolvedAt: new Date(start.getTime() + 62_000).toISOString(),
      resolutionPrice: '70100.00',
      resolutionTradeTime: new Date(start.getTime() + 62_000).toISOString(),
      resolutionFetchedAt: new Date(start.getTime() + 62_000).toISOString(),
      outcome: 'WIN',
      scoreDelta: 1,
    }
  }

  function me() {
    const base = {
      playerId,
      losses: 0,
      serverTime: serverNow,
    }
    if (phase === 'active') {
      return { ...base, score: 0, wins: 0, activePrediction: pending(firstId), latestResolvedPrediction: null, waitReason: 'WAITING_FOR_DEADLINE' }
    }
    if (phase === 'settled') {
      return { ...base, score: 1, wins: 1, activePrediction: null, latestResolvedPrediction: settled(), waitReason: null }
    }
    if (phase === 'second') {
      return { ...base, score: 1, wins: 1, activePrediction: pending(secondId), latestResolvedPrediction: settled(), waitReason: 'WAITING_FOR_DEADLINE' }
    }
    return { ...base, score: 0, wins: 0, activePrediction: null, latestResolvedPrediction: null, waitReason: null }
  }

  await page.clock.install({ time: start })
  await page.route('http://api.test/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/players') {
      playerPosts += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playerId, accessToken }) })
      return
    }
    if (request.method() === 'GET' && path === '/market') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          price: '65432.10',
          source: 'COINBASE_EXCHANGE',
          fetchedAt: serverNow,
          tradeTime: serverNow,
          isFresh: true,
        }),
      })
      return
    }
    if (request.method() === 'GET' && path === '/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me()) })
      return
    }
    if (request.method() === 'GET' && path === '/predictions') {
      const rows = phase === 'settled' || phase === 'second' ? [settled()] : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ predictions: rows, nextCursor: null }),
      })
      return
    }
    if (request.method() === 'POST' && path === '/predictions') {
      if (!heldCreate) {
        heldCreate = true
        await createGate
        phase = 'active'
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(pending(firstId)) })
        return
      }
      phase = 'second'
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(pending(secondId)) })
      return
    }
    await route.fulfill({ status: 404, body: '' })
  })

  await page.goto('/')
  const score = page.getByRole('region', { name: 'Your score' })
  await expect(score).toContainText('0')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()

  const up = page.getByRole('button', { name: 'Predict Bitcoin will go Up' })
  const down = page.getByRole('button', { name: 'Predict Bitcoin will go Down' })
  const placing = up.click()
  await expect(up).toBeDisabled()
  await expect(down).toBeDisabled()
  releaseCreate()
  await placing

  await expect(page.getByText('70,000.50')).toBeVisible()
  const heading = page.getByRole('heading', { name: 'Your prediction' })
  await expect(heading).toBeFocused()

  const postsAfterCreate = playerPosts
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your prediction' })).toBeVisible()
  expect(playerPosts).toBe(postsAfterCreate)

  // Pause inside the page. A separate pauseAt(Date.now()) can already be in the
  // past, because wall time keeps moving the fake clock. Then advance in 5s
  // steps, under the 8s /me abort, until the deadline has passed.
  await page.evaluate(async () => {
    const clock = (globalThis as unknown as { __pwClock: { controller: { pauseAt: (time: number) => Promise<void> } } }).__pwClock
    await clock.controller.pauseAt(Date.now())
  })
  serverNow = dueAt
  for (let step = 0; step < 13; step += 1) {
    await page.clock.runFor(5_000)
  }
  await expect(page.getByText('Comparing prices')).toBeVisible()
  await expect(page.locator('#receipt-heading')).toHaveCount(0)

  phase = 'settled'
  await page.clock.runFor(3_000)
  await expect(page.locator('#receipt-heading')).toHaveText('Correct')
  await expect(score).toContainText('+1')
  const rounds = page.getByRole('region', { name: 'Your rounds' })
  await expect(rounds).toContainText('70,000.50 to 70,100.00')
  await expect(rounds).toContainText('+1')
  await expect(page.locator('.flash-win')).toBeVisible()
  await expect(page.getByText('Correct. Score 1.')).toHaveCount(1)

  await expect(up).toBeEnabled()
  await up.click()
  await expect(page.getByRole('heading', { name: 'Your prediction' })).toBeVisible()
  await expect(down).toHaveCount(0)
})

test('accepts a double down and shows the pair, expiry, and a replaced offer', async ({ page }) => {
  const parentId = 'p_0000000000010_parent1'
  const bonusId = 'p_0000000000011_bonus01'
  const offerId = `o_${parentId}`
  let phase: 'ready' | 'won' | 'bonus' | 'bonus-won' | 'expired' | 'replaced' = 'ready'
  const issued = start.toISOString()
  const expires = new Date(start.getTime() + 10_000).toISOString()

  function offer(status: 'OPEN' | 'EXPIRED' | 'REPLACED' | 'ACCEPTED') {
    return {
      offerId,
      parentPredictionId: parentId,
      direction: 'UP',
      issuedAt: issued,
      expiresAt: expires,
      extensions: 0,
      status,
      bonusPredictionId: status === 'ACCEPTED' ? bonusId : undefined,
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
      resolutionPrice: '70100.00',
      resolutionTradeTime: issued,
      resolutionFetchedAt: issued,
      outcome: 'WIN',
      scoreDelta: 1,
    }
  }

  function bonusPending() {
    return {
      predictionId: bonusId,
      playerId,
      direction: 'UP',
      mode: 'DOUBLE_DOWN',
      parentPredictionId: parentId,
      status: 'PENDING',
      createdAt: issued,
      dueAt,
      entryPrice: '70200.00',
      entryTradeTime: issued,
    }
  }

  function bonusSettled() {
    return {
      ...bonusPending(),
      status: 'RESOLVED',
      resolvedAt: issued,
      resolutionPrice: '70300.00',
      resolutionTradeTime: issued,
      resolutionFetchedAt: issued,
      outcome: 'WIN',
      scoreDelta: 2,
      parent: { predictionId: parentId, scoreDelta: 1 },
    }
  }

  function me() {
    const base = { playerId, losses: 0, serverTime: start.toISOString(), features: { doubleDown: true } }
    if (phase === 'won') return { ...base, score: 1, wins: 1, activePrediction: null, latestResolvedPrediction: parentSettled(), waitReason: null, offer: offer('OPEN') }
    if (phase === 'bonus') return { ...base, score: 1, wins: 1, activePrediction: bonusPending(), latestResolvedPrediction: parentSettled(), waitReason: 'WAITING_FOR_DEADLINE', offer: offer('ACCEPTED') }
    if (phase === 'bonus-won') return { ...base, score: 3, wins: 2, activePrediction: null, latestResolvedPrediction: bonusSettled(), waitReason: null, offer: null }
    if (phase === 'expired') return { ...base, score: 1, wins: 1, activePrediction: null, latestResolvedPrediction: parentSettled(), waitReason: null, offer: offer('EXPIRED') }
    if (phase === 'replaced') return { ...base, score: 1, wins: 1, activePrediction: bonusPending(), latestResolvedPrediction: parentSettled(), waitReason: 'WAITING_FOR_DEADLINE', offer: offer('REPLACED') }
    return { ...base, score: 0, wins: 0, activePrediction: null, latestResolvedPrediction: null, waitReason: null, offer: null }
  }

  await page.clock.install({ time: start })
  await page.setViewportSize({ width: 375, height: 800 })
  await page.route('http://api.test/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/players') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playerId, accessToken }) })
      return
    }
    if (request.method() === 'GET' && path === '/market') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: '65432.10', source: 'COINBASE_EXCHANGE', fetchedAt: issued, tradeTime: issued, isFresh: true }) })
      return
    }
    if (request.method() === 'GET' && path === '/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me()) })
      return
    }
    if (request.method() === 'GET' && path === '/predictions') {
      const predictions = phase === 'bonus-won' ? [bonusSettled(), parentSettled()] : phase === 'ready' ? [] : [parentSettled()]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ predictions, nextCursor: null }) })
      return
    }
    if (request.method() === 'POST' && path === `/offers/${offerId}/accept`) {
      phase = 'bonus'
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(bonusPending()) })
      return
    }
    await route.fulfill({ status: 404, body: '' })
  })

  await page.goto('/')
  phase = 'won'
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Play one bonus round in the same direction?' })).toBeVisible()
  await expect(page.getByText('+1 kept')).toBeVisible()
  const actions = page.locator('.dd-action')
  await expect(actions).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true)
  await expect(page.getByRole('region', { name: 'Your score' })).toBeVisible()

  await page.getByRole('button', { name: 'Double down' }).click()
  await expect(page.getByRole('heading', { name: 'Your bonus round is in' })).toBeVisible()

  phase = 'bonus-won'
  await page.clock.runFor(2_000)
  await expect(page.getByRole('region', { name: 'Your rounds' })).toContainText('Pair +3')

  phase = 'expired'
  await page.reload()
  await expect(page.getByText('Offer ended. Your +1 is kept.')).toHaveCount(0)

  phase = 'won'
  await page.reload()
  await expect(page.getByRole('button', { name: 'Double down' })).toBeVisible()
  phase = 'expired'
  await page.clock.runFor(2_000)
  await expect(page.getByText('Offer ended. Your +1 is kept.', { exact: true })).toBeVisible()

  phase = 'won'
  await page.reload()
  await expect(page.getByRole('button', { name: 'Double down' })).toBeVisible()
  phase = 'replaced'
  await page.clock.runFor(2_000)
  await expect(page.getByText('Offer no longer available')).toBeVisible()
})
