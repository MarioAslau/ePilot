# T12 — Momentum Double Down: implementation plan

**Audience:** Cursor, implementing T12 in this repo.
**Branch:** `feat/T12-add-double-down` (based on `cfabcb8`, T11 merged).
**Read first:**
- `.cursor/rules/project-workflow.mdc`
- `docs/implementation-plan.md` (T12)
- `docs/architecture.md`
- `docs/hunch-ui-implementation-spec.md` (the UI/UX spec, §10 above all)

Follow the project workflow:
- implement only T12
- run checks
- report results honestly
- set T12 to **Awaiting manual verification**
- do not commit

---

## 0. How to use the UI spec in this repo

`docs/hunch-ui-implementation-spec.md` was written for a fresh build. **This repo already implements the core game (T02–T11).** For T12:

- **Use from the spec:**
  - §10 (all of Double Down)
  - the bonus variants in §5.6 (`RoundTicket`), §5.7 (`ResultReceipt`) and §5.9/§10.8 (history pair)
  - §6.2 offer mutations
  - §8.4 offer view derivation
  - the DD copy in §10/§11
  - the DD parts of §12 (a11y), §13 (motion) and §14 (tests)
- **Do not apply from the spec** (out of scope; existing code and architecture win):
  - the folder restructure (`src/features/game/…`), MSW, Storybook
  - the `/price` endpoint, integer cents, `hunch.player.v1`, `PRICE_UNAVAILABLE`
  - the receipt dismiss button
  - the IdleView title rewrites outside DD
  - ScoreCard copy ("Saved to this browser" **contradicts** the architecture's required score copy; keep the existing copy)
  - its polling numbers outside the offer window
- **API shapes**: the spec's §7 says the technical plan wins. Use the contracts below, written in this repo's style (UPPER_CASE enums, ISO strings, decimal price strings). The spec's lowercase/epoch/cents fields are illustrative only.
- **Game rules**: the spec and the ticket agree. If anything appears to change a rule, stop and flag it.

---

## 1. Rules (server enforces; UI only reflects)

- An offer is created **only** when a `STANDARD` round settles as `WIN` and the feature flag is on.
- One offer per winning round. `offerId = o_<parentPredictionId>` is deterministic.
- The window is **10 s from `issuedAt` (= the settlement's `resolvedAt`)**.
- **Need more time?** adds **20 s** per press, at most **10** extensions (spec §10.9, WCAG 2.2.1).
- Accept starts a bonus round:
  - mode `DOUBLE_DOWN`
  - **direction = the parent's direction (server-set; ignore any client direction)**
  - fresh entry quote (same 10 s trade-age rule)
  - `dueAt = createdAt + 60 s`
  - same workflow
- Scoring: `STANDARD` ±1, `DOUBLE_DOWN` **±2**. Pair totals are therefore +3 / −1. The original +1 is never touched.
- **No chains**: a `DOUBLE_DOWN` settlement never creates an offer.
- Starting a **standard** round while an offer is open marks it `REPLACED`.
- Decline marks it `DECLINED`.
- Expiry is **derived**: `OPEN && now ≥ expiresAt` is EXPIRED on read. Nothing writes it.
- `wins` / `losses` count every settled round, bonus rounds included (one each). Accuracy stays per round.

---

## 2. Contracts (`packages/contracts/src/index.ts`)

- `ModeSchema = z.enum(['STANDARD', 'DOUBLE_DOWN'])`. `PredictionSchema.mode` uses it.
- `PredictionSchema` additions:
  - `parentPredictionId?: string`
  - `scoreDelta: 1 | -1 | 2 | -2`
- `PredictionSchema.parent?: { predictionId, scoreDelta }`: only on a resolved bonus round in `/me`, for the pair line.
- `OfferStatusSchema = z.enum(['OPEN', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REPLACED'])`.
- `OfferSchema`:
  - `offerId`, `parentPredictionId`, `direction`, `issuedAt`, `expiresAt`, `extensions` (0–10), `status`
  - `bonusPredictionId?`, `replacedByPredictionId?`
- `MeResponseSchema` additions:
  - `offer: OfferSchema | null`: the **latest** offer, any status, while `now < expiresAt + 60 s` or the status is OPEN. This lets other tabs show used/replaced/expired notices.
  - `features: { doubleDown: boolean }`
- `OfferActionRequestSchema = { idempotencyKey: uuid }`: used by accept. Decline and extend take no body.
- `ErrorCodeSchema` additions:
  - `OFFER_EXPIRED`, `OFFER_ACCEPTED`, `OFFER_DECLINED`, `OFFER_REPLACED`
  - `OFFER_NOT_FOUND` (also used when the flag is off or it is another player's offer)
  - `MAX_EXTENSIONS`
  - All are HTTP **409**, except `OFFER_NOT_FOUND`, which is **404**.
- `evaluate()` is unchanged. It decides WIN / LOSS / EQUAL only.

---

## 3. Backend (`apps/api`)

### 3.1 Data (one table, player partition)

- **Offer item**: `pk = PLAYER#<id>`, `sk = OFFER#<offerId>`. Fields as in `OfferSchema`, plus `playerId`, `createdAt`.
- **Player**:
  - `openOfferId`: set on creation; removed on accept, decline or replace
  - `latestOfferId`: set on creation and kept, so `/me` can show end states
- **Prediction**: `mode`, `parentPredictionId` (bonus only).

### 3.2 Pure helpers

- `src/scoring.ts`: `scoreFor(mode, outcome)` gives ±1 for STANDARD and ±2 for DOUBLE_DOWN. `decide()` in `resolution.ts` maps `evaluate()`'s outcome through it.
- `src/offer.ts`:
  - `offerIdFor(parentId)`
  - `OFFER_WINDOW_MS = 10_000`, `EXTENSION_MS = 20_000`, `MAX_EXTENSIONS = 10`
  - `offerView(item, now)` derives EXPIRED

### 3.3 Settlement creates the offer, atomically (`predictionStore.settle`)

When the flag is on, `mode === 'STANDARD'` and `outcome === 'WIN'`, add to the **same** `TransactWriteItems`:
- `Put` the offer: `attribute_not_exists(pk)`, `issuedAt = resolvedAt`, `expiresAt = resolvedAt + 10 s`, `status OPEN`, `extensions 0`
- on the player update: `SET openOfferId = :o, latestOfferId = :o`

A retried or duplicate settle is still cancelled as `already_settled`, so no second offer and no second score. The memory store mirrors this synchronously.

The resolver role needs `dynamodb:PutItem` (it already has `TransactWriteItems`). Log `offer.created { playerId, parentPredictionId, offerId }`.

### 3.4 `POST /offers/{offerId}/accept`: new `handlers/acceptOffer.ts`

1. Auth as in `me.ts`. Parse the body. Check the flag (off → 404 `OFFER_NOT_FOUND`).
2. Idempotency: reuse `IDEMPOTENCY#<key>` with `kind: 'OFFER_ACCEPT', offerId`.
   - Same key + same offer → 200 with the stored bonus prediction.
   - Same key + another offer → 409 `IDEMPOTENCY_CONFLICT`.
3. Pre-read the offer and the player.
   - Missing or another player's → 404.
   - Map the status: `OFFER_ACCEPTED`, `OFFER_DECLINED`, `OFFER_REPLACED`, or `OFFER_EXPIRED` when `now ≥ expiresAt`.
   - Player has an active round → 409 `ACTIVE_ROUND`.
4. `fetchTicker()` plus the 10 s entry freshness check. Failure → 503 `PROVIDER_UNAVAILABLE`, **nothing written, the offer stays OPEN**.
5. **One `TransactWriteItems`:**
   - Offer `Update`: `status = OPEN AND expiresAt > :now` → `ACCEPTED`, `bonusPredictionId`
   - Player `Update`: `openOfferId = :o AND attribute_not_exists(activePredictionId)` → `SET activePredictionId = :p REMOVE openOfferId`
   - Prediction `Put`: `mode DOUBLE_DOWN`, parent direction, `parentPredictionId`, pending GSI attrs (reuse `buildPrediction`)
   - Idempotency `Put`
6. On cancellation:
   - idempotency failed → replay
   - otherwise re-read the offer → its status code, or `OFFER_EXPIRED`, or `ACTIVE_ROUND`
7. On success, `startPredictionWorkflow` exactly as `createPrediction` does (same failure handling and logs) → 201.

Log `offer.accepted` / `offer.rejected { reason }`.

### 3.5 `POST /offers/{offerId}/decline`

Conditional `Update`: offer `status = OPEN` → `DECLINED`; player `REMOVE openOfferId` (condition `openOfferId = :o`). Idempotent: an already DECLINED offer → 200. Other states → their 409 code. Log `offer.declined`.

### 3.6 `POST /offers/{offerId}/extend`

`Update` with condition `status = OPEN AND expiresAt > :now AND extensions < :max AND expiresAt = :seen`, where `:seen` is the value read first. It does `SET expiresAt = :seen + 20 s, extensions = extensions + 1`.
- On a condition failure, re-read and return the right code (`MAX_EXTENSIONS`, `OFFER_EXPIRED`, …).
- Success → 200 with the offer.
- Log `offer.extended`.

### 3.7 Standard round replaces the offer (`createPrediction`)

If the pre-read player has `openOfferId`, add to its existing transaction:
- offer `Update` `status = OPEN` → `REPLACED`, `replacedByPredictionId`
- `REMOVE openOfferId` on the player update

If the offer was already accepted, declined or expired at the same time, the offer condition fails. Then re-read and retry the create **once** without the offer item. That keeps standard play working when an expired offer never had its status written.

**The player-item conditions still decide any accept-vs-create race, so exactly one round exists.** Log `offer.replaced`.

### 3.8 `GET /me`

- Load `latestOfferId` → `offer` (derive EXPIRED; apply the visibility window in §2).
- `features.doubleDown` from the flag.
- Bonus rounds carry `mode` and `parentPredictionId`.
- When `latestResolvedPrediction` is a bonus round, include `parent: { predictionId, scoreDelta }` (one extra `GetItem`).

### 3.9 History (`getPredictionHistory`, T11)

Response items now include `mode` and `parentPredictionId`. No query change.

### 3.10 Feature flag

- `serverless.yml`: `--param doubleDown=on|off`, default **off** → env `FEATURE_DOUBLE_DOWN`.
- It goes on the resolver, `me`, `createPrediction`, and the new offer functions.
- `yarn dev:local`: on by default, overridable by an env var.

### 3.11 Infrastructure (`serverless.yml`)

- New routes: `POST /offers/{offerId}/accept`, `/decline`, `/extend`. Use one `offers` Lambda routed by path, or three thin handlers (follow the existing one-handler-per-use-case style).
- New `OfferLambdaRole` with `GetItem`, `PutItem`, `UpdateItem`, `TransactWriteItems` on the table, plus `states:StartExecution` on the resolution machine.
- Resolver role: add `PutItem`.
- CORS already allows POST.

### 3.12 Local dev (`localDev.ts`, `memoryStore.ts`)

- Implement the new store methods synchronously, with the same conditions.
- Route the three offer endpoints.
- New dev fault `next-resolution-win`: the next resolution quote moves in the player's favour (entry ± 1, by direction), so offers can be tested without waiting for a market win. Serve-only, as with the existing faults.

---

## 4. Frontend (`apps/web`)

Keep the current structure (`App.tsx`, `round.ts`, `usePrediction.ts`, `components/*`). Add:

1. **`src/offer.ts` (pure, unit-tested)**: `offerView(offer, local, serverNowMs)` → `null | 'open' | 'submitting' | 'expired' | 'declined' | 'used' | 'replaced'`, per spec §8.4.
   - `local = { seenOfferIds, dismissedOfferIds, acceptedHereOfferId, replacedHereOfferId, mutation }`
   - End states show only if this tab saw the offer OPEN.
   - A replace started in this tab shows nothing.
   - Local expiry at `serverNow ≥ expiresAt`.
   - Also `pairFromHistory(rows)` for §10.8 grouping (bonus row + adjacent parent → one pair; an orphaned bonus row shows alone).
2. **`src/useOffer.ts`**:
   - accept, decline and extend calls with an 8 s timeout
   - one in-memory idempotency key per offer for accept, reused on unknown outcomes (same pattern as `usePrediction`)
   - while any offer or prediction mutation is pending, all triggers are disabled
   - on success, write `setQueryData`/invalidate on `['player', …]` and `['history', …]`
3. **Polling** (`round.ts` `pollInterval`): **2 s while an offer is OPEN**. Existing intervals stay as they are otherwise.
4. **`components/DoubleDownOffer.tsx`**: exactly spec §10.2–10.3:
   - an accent-bordered `raised` panel and a 3 px draining meter (`scaleX(remaining / (expiresAt − issuedAt))`)
   - under reduced motion, **10 pips** (§10.10)
   - `DoubleDownBadge` (`Layers` icon), "Ns left" (`aria-hidden`)
   - h2 "Play one bonus round in the same direction?"
   - the "+1 kept" line, the fixed-direction line
   - payout tiles (`aria-hidden`, plus an `aria-describedby` hidden description)
   - **two identical neutral 48 px buttons**, "Double down" and "No thanks"
   - footer "Picking Up or Down below also ends this offer." plus the "Need more time?" link-button (hidden after 10 extensions)
   - submitting state: spinner, "Recording…", `aria-busy`, "No thanks" disabled, "⏸ Timer held", frozen meter
   - inline error on a generic failure while the offer lasts

   No pressure copy, colour-coded timer, sound, focus stealing or confirm dialog.
5. **`components/OfferNotice.tsx`**: the neutral or info, dismissible notices for §10.4 (expired, declined) and §10.7 (used in another tab with `Ban`, replaced with `Copy`), shown above the relevant ticket.
6. **Placement** (`PredictionPanel` / App idle view): the order is receipt → `DoubleDownOffer` or `OfferNotice` → existing notices → Up/Down buttons. Up/Down stay enabled while an offer is open. The title is "Nice call. Bonus round?" while the offer is open (spec §5.4).
7. **`RoundTicket`** bonus variant (§5.6, §10.5):
   - `DoubleDownBadge` in the head
   - the yellow-soft bonus strip "Bonus on round R-xxxx, **+1 kept**" + "Right **+2** (pair +3) · Wrong **−2** (pair −1)"
   - a subtle accent outline
   - bonus titles "Your bonus round is in" / "Getting your bonus result" / "Bonus round on hold"
8. **`ResultReceipt`** bonus variant (§5.7, §10.6):
   - badge, "Bonus round correct" / "Bonus round missed", ±2
   - the pair line "Round R-xxxx **+1** + Bonus **+2** … Pair total **+3**", with a worded `aria-label`, using `parent.scoreDelta`
   - "Bonus entry" label
9. **`RoundHistory`** (T11): pair grouping per §10.8.
   - One `<li>` with a "Double Down pair" badge and "Pair +3" / "Pair −1".
   - A nested `<ol aria-label="Double Down pair, total +3">` with the indented accent connector.
   - "Bonus" in the title for a lone bonus row.
   - This keeps working with lazy loading (the parent may arrive on a later page; regroup on every render).
10. **Announcements** (existing live region in `App.tsx`; `announcement()` in `round.ts`):
    - On a win with an open offer, the **single combined message** from §10.11.
    - Then once each: "Bonus round started …", "20 seconds added. Offer ends in N seconds.", "Double down offer ended. Your +1 is kept.", and the bonus result "Bonus round correct, plus 2 points. Pair total plus 3. Your score is now N."
    - Never seconds.
11. **Focus**: Accept success and Decline → `#play-title` / the round heading (the existing rule). The offer appearing never moves focus.
12. **HowItWorks**: a Double Down section (rules + arithmetic) only when `features.doubleDown`.
13. **Fixtures** (`FixtureApp`, dev-only), one per state:
    - `dd-offer`, `dd-offer-extended`, `dd-submitting`
    - `dd-expired`, `dd-declined`, `dd-used`, `dd-replaced`
    - `dd-active`, `dd-win`, `dd-loss`
    - `dd-history`, `dd-reduced-motion`
14. **Tokens/CSS**: reuse the existing tokens. Add classes for the offer panel, meter, pips, badge, bonus strip and pair connector to `styles/tokens.css`. Reuse existing utilities. No new dependencies; `lucide-react` is already installed.

---

## 5. How this satisfies the T12 ticket

| T12 requirement | Where |
|---|---|
| Approved offer design; +1 kept, ±2, +3/−1 before opt-in; decline/expiry/submitting/active/result/restored states | UI spec §10 → §4 items 4–13 |
| Standard play stays easy; a new standard round invalidates the offer consistently | §3.7 transaction + Up/Down enabled under the offer |
| Offer, parent and mode fields | §2, §3.1 |
| Authenticated, conditional acceptance | §3.4 single transaction |
| Expiry and one active prediction | `expiresAt > :now` + player `attribute_not_exists(activePredictionId)` |
| Durable resolution with explicit mode scoring | same workflow; `scoreFor` (§3.2) |
| Exact scoring before acceptance | Offer payout tiles + description |
| Independent backend feature flag and UI visibility | §3.10 + `features.doubleDown` + offer presence |
| Tests: eligibility, expiry, concurrent acceptance, retries, restoration, arithmetic, no chaining | §6 |
| Measure acceptance and completion | `offer.*` logs + queries in §7 |

---

## 6. Automated checks

**Contracts**: schema round-trips; `scoreDelta` ±2 accepted, other values rejected.

**API unit tests** (memory store, injected clock, quote and ids):
- `scoring.test.ts`: `scoreFor` table; pair totals +3 / −1.
- Settlement:
  - STANDARD WIN + flag on → one OPEN offer, `openOfferId`/`latestOfferId` set
  - LOSS → none
  - flag off → none
  - **DOUBLE_DOWN WIN → none (no chaining)**
  - duplicate settle → still one offer, score once
  - DOUBLE_DOWN scores ±2, wins/losses +1
- `acceptOffer.test.ts`:
  - happy path: parent direction (a client `direction` field is ignored), fresh entry, `dueAt = +60 s`, `StartExecution` once
  - **expired at exactly `expiresAt` → 409 `OFFER_EXPIRED`, nothing written**
  - **concurrent accepts with different keys (`Promise.all`) → one 201, one 409, one bonus round**
  - **retry with the same key → same prediction**; same key + other offer → `IDEMPOTENCY_CONFLICT`
  - provider down → 503, offer still OPEN
  - active round → `ACTIVE_ROUND`
  - another player's offer → 404
  - flag off → 404
  - declined / replaced / accepted → matching codes
- `declineOffer` / `extendOffer`:
  - decline twice is idempotent
  - accept after decline → `OFFER_DECLINED`
  - extend adds 20 s and increments
  - the 11th extend → `MAX_EXTENSIONS`
  - extend after expiry → `OFFER_EXPIRED`
  - two concurrent extends → one applies (stale `:seen`)
- `createPrediction`:
  - with an open offer → the offer becomes `REPLACED` and the round is created
  - **accept-vs-create race → exactly one round and a consistent offer status**
  - expired-but-OPEN offer → create succeeds (retry without the offer item)
- `me`:
  - restores an OPEN offer with the right `expiresAt`
  - end states inside the visibility window, none after
  - bonus active and result with `parent.scoreDelta`
  - `features` flag
- Logs test (existing `logs.test.ts`): offer events never contain the token or its hash.

**DynamoDB Local integration** (`apps/api/src/integration`, existing T10 suite): accept race, accept-vs-create race, extend race, settle-with-offer atomicity.

**Web unit/component tests**:
- `offer.test.ts`: every status × seen/unseen × dismissed × acceptedHere × replacedHere combination; local expiry; `pairFromHistory` including an orphaned bonus row.
- `DoubleDownOffer`:
  - **the two action buttons have identical class lists**
  - arithmetic text and hidden description present
  - "Need more time?" hidden at 10 extensions
  - submitting freezes the meter and sets `aria-busy`
  - reduced motion renders 10 pips
  - inline error keeps the offer
- `RoundTicket`, `ResultReceipt` and `RoundHistory` bonus variants: badge, strip, pair line (only for bonus), grouped pair.
- `App`:
  - win → combined announcement once
  - accept → bonus ticket + focus
  - expiry notice
  - Up while the offer is open ends it with no notice in this tab
  - restore after a remount in each state
  - no repeated announcements

**Playwright** (extend the existing `apps/web/e2e/critical-journey.spec.ts` style with `page.route` + `page.clock`; no MSW):
- win → offer → accept → bonus win → "+3" pair in history
- offer expires → "Offer ended. Your +1 is kept."
- another tab replaces it (the fixture returns `REPLACED` + a new active round) → "Offer no longer available" above the new ticket
- 375 px: header score visible, no horizontal scroll

**Commands** (all must pass):
- `yarn typecheck`
- `yarn lint`
- `yarn test`
- `yarn workspace api test:int` (CI)
- `yarn workspace web build` + the CI dist guard
- `yarn workspace web e2e`
- `yarn serverless package --stage dev --region eu-north-1`: inspect the new routes, `OfferLambdaRole`, resolver `PutItem`, `FEATURE_DOUBLE_DOWN` env, no `Scan`

---

## 7. Docs to update

- `docs/implementation-plan.md`: T12 → Awaiting manual verification, a diary entry with real check results, and the progress block.
- `docs/architecture.md`:
  - Offer item, `openOfferId`/`latestOfferId`
  - settlement with offer creation
  - accept/decline/extend contracts and transactions
  - replace rule
  - mode scoring
  - flag
  - new error codes
  - IAM
  - Logs Insights queries for acceptance (accepted/created), completion (bonus settled/accepted) and expiry (created − accepted − declined − replaced)
  - decision **D7, Momentum Double Down as built**, including the 10 s + 20 s × 10 extension decision and WCAG 2.2.1
- `README.md`: feature description, `--param doubleDown=on`, the local `next-resolution-win` fault, limits.

---

## 8. Mario's manual testing

**Local** (`yarn dev:local`; send faults with `curl -X POST http://localhost:5173/api/__dev/next-prediction -H 'Content-Type: application/json' -d '{"mode":"next-resolution-win"}'`):
1. Arm a win, then play Up. After the receipt, the offer shows:
   - +1 kept, direction fixed Up
   - +2 / pair +3 and −2 / pair −1
   - a draining 10 s meter
   - two identical buttons
   - focus has not moved
   - VoiceOver (optional) speaks the single combined message
2. Double down. The submitting state, then the bonus ticket with the badge and strip and a fresh entry. After 60 s+: "Bonus round correct/missed", ±2, the pair line. The score changes by 2 once. **No new offer.** History shows one grouped pair.
3. Arm a win again. Press **Need more time?** twice: +20 s each, announced. Let it expire: "Offer ended. Your +1 is kept."
4. Arm a win, then press **No thanks**: "No bonus round. Your +1 is kept.", and focus goes to the title.
5. Arm a win, then press **Up** while the offer is open. A normal round starts and no offer notice appears in this tab.
6. Two tabs on one player: accept in tab A. Tab B shows "Offer no longer available… you already doubled down" above the bonus ticket. Repeat with tab A starting a normal round: tab B shows the "replaced" notice.
7. Refresh during the offer (it restores with the right remaining time), during the bonus round, and on the bonus receipt.
8. Arm `provider-down`, then Double down: "Bonus round not started… Your +1 is kept", and Retry works while the offer lasts.
9. Reduced motion on: 10 pips, no draining animation. 375 px: no horizontal scroll, header score visible.
10. `?fixture=dd-…` states for visual review against the design.

**Hosted** (deploy from `apps/api` with the usual params plus `--param doubleDown=on`, then push `release`):

11. Repeat 2, 5 and 7 with real market wins.
12. Redeploy with `doubleDown=off`: no offers; standard play and history are unchanged.
13. Logs Insights: the acceptance and completion queries return your test counts.

---

## 9. Defaults chosen; Mario can override before implementation

1. **Extension cap**: 20 s × up to 10 (spec §10.9). The alternative is a single "Pause until I choose".
2. **Offer clock** starts at settlement (`issuedAt = resolvedAt`), so a player polling at 1–2 s sees about 8–9 s. This matches spec §10.1 "from the server's issuedAt".
3. **wins / losses** include bonus rounds.
4. **Flag default** off. On for `dev` via the param, and on in `yarn dev:local`.
5. **HTTP codes**: offer-state conflicts are 409 with distinct `code`s; an unknown, foreign or disabled offer is 404.
6. **Visibility window** for ended offers in `/me`: 60 s after `expiresAt`.
7. **Spec items deliberately not adopted** in T12 (see §0). This includes the spec's ScoreCard copy, which conflicts with the architecture's required wording.
