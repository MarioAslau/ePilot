# Architecture

## Status

Proposed design. Application and infrastructure are not implemented yet.
Update this document when implementation changes the design.

## Product goal

A player should understand the game quickly, trust the result and
return to their saved progress without needing to register.

Deliver the standard prediction loop before optional modes.

## Standard rules

- New player score: 0.
- Player chooses Up or Down.
- One active prediction per player.
- Backend records entry price and creation time.
- Earliest settlement: creation time plus 60 seconds.
- Compare a fresh resolution price against the entry price.
- Equal price: remain pending and retry.
- Correct prediction: +1 point.
- Incorrect prediction: -1 point.
- Persist score and prediction state.

Movements during the first minute do not settle the round.
This design uses the first differing valid observation used by the
resolver after the deadline, not necessarily the first exchange trade
at exactly second 60.

## Stack and tradeoffs

### React, TypeScript and Vite

React builds the interface.
TypeScript checks application contracts during development.
Vite provides development and production builds.

A client-rendered application is sufficient.
Server rendering would add little value to this game.

### Tailwind and Lucide

Provide consistent styling and icons quickly.
Use a dark market-style interface with clear primary actions.
Prefer readability over a complex trading dashboard.

### TanStack Query and polling

Manage backend data, caching, refetching and mutation invalidation.
Initially poll prices around every 5 seconds and active player state
around every 2 seconds.

Polling is simpler than WebSockets for a one-minute game.
Revisit if scale, cost or latency requirements justify it.

### Zod

Validate untrusted requests and third-party responses at runtime.
TypeScript alone does not validate network data.

### API Gateway HTTP API

Provide one HTTP boundary and routes to focused Lambda functions.
Use HTTP API because the required routes do not currently need
REST API-specific capabilities.

### Focused TypeScript Lambdas

One handler per meaningful use case.
Keep domain logic separate from transport and AWS integration.

Proposed functions:
- createPlayer
- getPlayerState
- getMarketPrice
- createPrediction (also calls sfn:StartExecution synchronously after the DB write; see D2)
- resolvePrediction
- recoverStuckPredictions (scheduled scanner; see D2)
- getPredictionHistory
- acceptOffer, added for optional modes
- health

### DynamoDB

Persist players, predictions, idempotency records and later offers.
Conditional writes and transactions protect game invariants.

An SQL database would also work, but current access patterns are simple
and DynamoDB fits the selected AWS serverless approach.

### Step Functions Standard

Wait durably and coordinate resolution retries independently
of the browser.

Avoid waiting inside a Lambda invocation.
Avoid browser-owned timers for authoritative settlement.

### Serverless Framework

Define Lambda events and AWS infrastructure through serverless.yml
and CloudFormation resources.

Chosen because it matches Mario's production experience.
CDK is an alternative authoring tool, not a requirement for access
to API Gateway, DynamoDB, Step Functions or IAM.

### Coinbase Exchange

Use public BTC-USD market data.
Validate responses, bound request time and record source/timestamps.
Check provider documentation and rate limits during implementation.

### Amplify Hosting

Build and host the frontend from GitHub.
Keep backend infrastructure in Serverless Framework.
Do not introduce a separate Amplify-managed backend.

### Tests and operations

- Vitest: domain and backend tests.
- React Testing Library: observable UI behaviour.
- Playwright: critical browser journey.
- CloudWatch: structured logs and actionable alarms.
- GitHub Actions: repeatable checks and build validation.

## End-to-end flow

1. Browser restores anonymous credentials or creates a player.
2. Browser fetches backend score and display price.
3. Player submits direction with an idempotency key.
4. Backend fetches a fresh entry quote.
5. DynamoDB transaction creates prediction and locks the player.
6. createPrediction Lambda calls sfn:StartExecution with a deterministic name (prediction-{predictionId}).
7. Step Functions begins the durably named Standard execution.
8. Workflow waits until dueAt.
9. Resolver retrieves a fresh quote after the deadline.
10. Equal price causes another wait.
11. Differing price causes an atomic settlement transaction.
12. Browser polling receives the confirmed result.

## Anonymous identity

On first visit, `POST /players` generates two values:

- **Player ID** — a short human-readable identifier (e.g. `anon_7F3A`).
  Public. Returned to the browser and stored in DynamoDB.
- **Access token** — `crypto.randomBytes(32).toString('hex')`, 64 hex
  characters, 256 bits of entropy. Secret. Returned to the browser in
  the response body once and never stored on the server.

The browser saves both to `localStorage`. Every subsequent authenticated
request sends them in an `Authorization` header.

The backend stores only the SHA-256 hash of the raw token
(`crypto.createHash('sha256').update(token).digest('hex')`) on the
Player record. To authenticate a request it hashes the incoming token
and compares it to the stored hash using `crypto.timingSafeEqual` to
prevent timing attacks. There is no decryption step; hashing is
one-way.

A player ID identifies a record; the token proves ownership.
The browser never owns the authoritative score.

On browser return, the token is still in `localStorage`. The browser
sends it with `GET /me`; the backend verifies and returns the player's
score and active prediction. See D3 in the decision log.

Limitations:
- Clearing storage loses access; the orphaned DynamoDB record remains.
- Different devices do not share identity.
- `localStorage` tokens are exposed if the app suffers an XSS flaw.
- This is anonymous continuity, not account authentication.

Do not log tokens or render unsafe user-provided HTML.

## Proposed API

- POST /players
  Create anonymous identity. Return ID and token.

- GET /me
  Return authenticated player score and active/latest prediction.

- GET /market
  Return latest available display price and metadata.

- POST /predictions
  Accept direction and idempotency key.
  Return created prediction or the original duplicate result.

- GET /predictions
  Return authenticated player history with pagination.

- POST /offers/{offerId}/accept
  Optional mode acceptance. Validate eligibility and expiry.

- GET /health
  Basic deployment connectivity check.

Exact schemas live in `packages/contracts`.
Use a consistent error shape with code, message and request ID.

Proposed responses:
- 400: invalid input
- 401: invalid anonymous credentials
- 409: active prediction or conflicting idempotency payload
- 503: provider unavailable

## Contracts

Implemented in `packages/contracts`. Zod schemas are the runtime check;
the exported types are what the API and the browser share.

Prices are decimal strings (`PriceString`). Comparison uses scaled
`BigInt` values, not `parseFloat`. `"65432.10"` and `"65432.1"` are equal.
Display rounding cannot decide a win or a loss.

Timestamps are ISO 8601 strings. `resolutionTradeTime` is the Coinbase
ticker `time` of the compared trade. `fetchedAt` on a display quote is
not a settlement input.

`evaluate` is a pure function. The caller passes `createdAt` and
`resolvedAt`. It does not read the clock. If fewer than 60 seconds
have elapsed it returns `TOO_EARLY` and does not look at the price.
An equal price returns `EQUAL_PRICE`. Otherwise the score delta is
exactly `+1` or `-1`.

`GET /me` returns `activePrediction`, `latestResolvedPrediction`
(identified by `predictionId`), `serverTime`, and `waitReason`.
`waitReason` is `WAITING_FOR_DEADLINE`, `CHECKING_PRICE`, `EQUAL_PRICE`,
`PROVIDER_HOLD`, or `null`. The UI must use that field. It must not
infer an equal-price or provider hold from the display quote.
Display freshness is `MarketResponse.isFresh` only.

`POST /players` returns `playerId` and a 64-hex-character access token
once. `POST /predictions` takes `direction` and a UUID `idempotencyKey`.
If that response is lost, send the same body again. That replay is
`RecoverSubmissionRequest`. Do not mint a new key until the server answers.

Error codes: `INVALID_INPUT`, `UNAUTHORIZED`, `ACTIVE_ROUND`,
`IDEMPOTENCY_CONFLICT`, `PROVIDER_UNAVAILABLE`.
Only `PROVIDER_UNAVAILABLE` is in `RECOVERABLE_ERROR_CODES`.

## Proposed data model

Use one DynamoDB table with partition/sort keys designed around
actual access patterns. Finalise exact indexes during implementation.

Player:
- playerId
- accessTokenHash
- score
- wins          (count of correct predictions; displayed in ScoreCard at MVP)
- losses        (count of incorrect predictions; displayed in ScoreCard at MVP)
- activePredictionId
- createdAt

Prediction:
- predictionId
- playerId
- direction
- mode
- status
- createdAt
- dueAt
- entryPrice
- entryQuoteMetadata
- resolvedAt
- resolutionPrice
- resolutionTradeTime   (exchange timestamp of the compared trade, from the Coinbase ticker `time` field)
- resolutionQuoteMetadata
- outcome
- scoreDelta
- parentPredictionId, optional

Idempotency record:
- playerId
- requestKey
- requestPayloadHash
- predictionId
- expiry, if a retention policy is used

Offer, optional:
- offerId
- playerId
- parentPredictionId
- mode
- expiresAt
- status
- acceptedPredictionId

Query player history; do not scan the whole table.

## Price handling

Keep prices as decimal strings in storage and API contracts.
Use a decimal-safe implementation for comparison.
Formatting/rounding is only for display.

Store provider observation time where available and fetchedAt.
Reject malformed or unusably stale settlement data.
Document freshness policy when the provider adapter is implemented.

Display prices may be cached.
Entry and resolution quotes follow their own freshness requirements.

## Concurrency and idempotency

### Idempotency key

Before submitting a prediction the browser generates a key with
`crypto.randomUUID()` (built into all modern browsers, no library needed).
The key is stored client-side while the request is in flight and reused
on any retry.

The backend stores one Idempotency record per `(playerId, idempotencyKey)`:

```
playerId:       string
idempotencyKey: string   (UUID v4 from the browser)
direction:      "up" | "down"
predictionId:   string
expiresAt:      TTL, 24 hours
```

On a repeated request with a known key: return the stored prediction
immediately without re-executing creation logic.
On a repeated request with a known key but a different direction: return
`409 IDEMPOTENCY_CONFLICT`. Do not process.

This makes `POST /predictions` safe to retry after a lost response.
See D4 in the decision log.

### Prediction creation transaction

The DynamoDB transaction applies all of the following atomically, or none:
- Condition: player has no `activePredictionId`.
- Write: new Prediction record.
- Write: set `activePredictionId` on the Player record.
- Write: Idempotency record for this request.

If the condition fails (player already has an active prediction):
return `409 ACTIVE_ROUND`. The transaction condition — not application
code — is what enforces the one-active-prediction rule. Two simultaneous
requests with different keys both hit the condition; only the first to
land succeeds.

### Settlement transaction

The DynamoDB transaction applies all of the following atomically, or none:
- Condition: prediction status is not yet resolved.
- Condition: player's `activePredictionId` matches this prediction.
- Write: outcome, resolution price, `resolutionTradeTime` and quote metadata.
- Write: score delta on Player record.
- Write: increment `wins` or `losses` on Player record depending on outcome.
- Write: clear `activePredictionId` on Player record.

Transactions either apply all changes or none.
Duplicate settlement calls return the stored outcome without re-applying
the score delta.

## Workflow startup and recovery

After writing the Prediction record, createPrediction calls
`sfn:StartExecution` synchronously with the execution name
`prediction-{predictionId}`. If the call fails or the Lambda crashes
after the DB write, the execution is never started. This window is
narrow but real.

Recovery path: a scheduled recoverStuckPredictions Lambda runs every
five minutes. It queries for Prediction records in status `pending`
whose `dueAt` is more than two minutes in the past and for which no
active Step Functions execution exists. For each, it calls
`StartExecution` with the same deterministic name.

`StartExecution` with the same execution name is idempotent: Step
Functions returns the existing execution without creating a duplicate.

This replaces the originally proposed DynamoDB Streams approach.
Streams provided near-automatic recovery at the cost of a stream
configuration, event-source mapping, filtering, at-least-once delivery
handling and a harder local test story. The synchronous call with a
scheduled recovery scanner is simpler to build, test and explain,
and the failure window is operationally acceptable at this scale.
See D2 in the decision log.

## Failure behaviour

- Entry quote unavailable: do not create a round.
- Display quote unavailable: show last quote as stale.
- Resolution provider failure: remain pending and retry.
- Equal price: remain pending and retry.
- Browser timeout: reconcile or retry with the same idempotency key.
- Duplicate settlement: return stored outcome.
- Permanent workflow failure: alert and recover operationally.

Never convert infrastructure/provider failure into a player loss.
Never claim retries provide guaranteed recovery without operational limits.

## Frontend states

- Initialising player
- Ready
- Submitting prediction
- Active countdown
- Checking price
- Waiting for a different price
- Resolved win/loss
- Recoverable error

Backend state controls eligibility and outcome.
Countdown is presentation only.
Consider server/client clock offset.

## UI design

### References

Design files live at these stable repository paths, added during T01:

- `docs/design/hunch-prototype.html` — the approved interactive HTML prototype
  with a built-in state gallery, scenario controls and design-system view.
- `docs/design/desktop-ready.png` — desktop screenshot, ready state.
- `docs/design/desktop-rules-open.png` — desktop screenshot, rules panel expanded.
- `docs/design/desktop-active.png` — desktop screenshot, active prediction with countdown.

These are reference assets. Implement the product in React/TypeScript;
do not ship the prototype's in-page mock server.

### Design principles

Four principles govern every state and copy decision:

- **Confirmed beats instant.** Show only outcomes the server has confirmed.
  A finished countdown shows "Comparing prices", never a premature result.
- **Every number has a source.** Entry price, compared price and timestamps
  appear on every receipt so a player can verify the result themselves.
- **Colour means direction.** Green is Up and wins; red is Down and losses;
  yellow is the brand and the player's entry marker. Never colour alone:
  every state pairs with an icon and words.
- **Failures are never losses.** Outages and provider holds use neutral or
  amber styling, never red. Copy says what happened and what will happen next.

### Visual identity and tokens

Product name: **Hunch**. Dark trading-inspired style with charcoal
background, raised cards, yellow brand/focus accents, green Up and red Down.

```
/* Surfaces */
--bg:           #121418   page background
--surface:      #1A1D23   cards
--raised:       #22262D   inset panels, controls
--line:         #2C3139   borders
--line-strong:  #3B414B   stronger borders

/* Text */
--text:         #ECEEF1   primary
--muted:        #A3ABB7   secondary
--subtle:       #8A93A0   captions, meta

/* Brand and semantic */
--accent:       #F2C14E   brand, entry line, focus ring, current step
--accent-ink:   #1A1408   text on accent
--accent-soft:  rgba(242,193,78,.12)

--up:           #26C281   Up direction, correct outcome
--up-ink:       #04150D
--up-soft:      rgba(38,194,129,.12)
--up-line:      rgba(38,194,129,.35)

--down:         #F2555F   Down direction, incorrect outcome
--down-ink:     #1E0508
--down-soft:    rgba(242,85,95,.12)
--down-line:    rgba(242,85,95,.35)

--warn:         #F0A53A   delayed feed, on-hold state
--warn-soft:    rgba(240,165,58,.12)
```

Use these as implementation reference. Verify contrast ratios on actual
controls before shipping.

### Typography

Font family: Archivo with system fallback (`ui-sans-serif, "Helvetica Neue",
Helvetica, Arial, sans-serif`). Use the variable width axis: slightly
expanded for the wordmark and headings; slightly condensed for large prices
so they fit at 375 px.

All prices, scores and timers use `font-variant-numeric: tabular-nums
lining-nums` to prevent layout shift during live updates.

| Role | Size / Weight | Notes |
|------|---------------|-------|
| Display price | 48 px / 700, 96% width | clamp to viewport |
| Score | 56 px / 760 | |
| Timer | 36 px / 720, tabular | |
| H1 / play title | 22 px / 700, 104% width | |
| H2 | 16 px / 650 | |
| Body | 15 px / 400, 1.5 lh | |
| Caption / fine | 12 px / 400 | |

4 px spacing grid: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.
Radius hierarchy: 999 px pills, 10 px controls and nested panels,
14 px top-level cards.

### Layout

Desktop (960 px+): two-column grid inside a 1120 px centred content area.
Left column (7fr): MarketCard and PredictionPanel stacked. Right column
(5fr): ScoreCard, RoundHistory and HowItWorks stacked.

Mobile (below 960 px): single column. Stacking order:
1. Header (logo + anonymous ID + score chip)
2. MarketCard
3. PredictionPanel
4. ScoreCard
5. RoundHistory / history placeholder
6. HowItWorks

Keep the current score visible on mobile at all times without depending
on the desktop sidebar. The header score chip appears only below 960 px.

### Component responsibilities

These are named responsibilities, not a requirement to create one file per label.
Reuse or split as implementation dictates; keep presentation components
separate from data-fetching.

| Component | Responsibility |
|-----------|----------------|
| AppHeader | Logo, anonymous player ID, header score chip (mobile) |
| MarketCard | Price display, source/freshness pill, sparkline chart |
| PriceStatus | Live / Delayed / Unavailable pill with dot or icon |
| PriceChart | SVG sparkline built from validated in-session observations |
| PredictionPanel | Hosts DirectionButtons or active RoundTicket or ResultReceipt |
| DirectionButtons | Up/Down buttons with locked and loading states |
| RoundTicket | Entry price, latest price, step tracker, wait ring, state copy |
| ResultReceipt | Outcome badge, score delta, entry/compared price, timestamps |
| ScoreCard | Numeric score; after the first settled round also shows accuracy %, wins and losses counts |
| RoundHistory | Settled prediction list; honest placeholder until T11 |
| HowItWorks | Expandable accordion; MVP content in from T02 |
| StatusNotice | Info / warn / error inline notices with icon, copy and action |

### Application states

**Ready**
Show the latest available price, source, update age, player score, Up/Down
buttons and a concise rules summary. Negative scores are valid and must
display correctly. Disable direction buttons until player setup completes.

**Submission**
Lock both buttons immediately when a direction is chosen.
Show "Recording entry" with a spinner.
On server confirmation, render the RoundTicket with the server-confirmed
direction, accepted price and timestamps.
Do not treat the price the player saw when they clicked as the accepted
entry price; the backend fetches a fresh quote at acceptance time.
Show an entry-note if the server price differs from the displayed price.

**Active / Waiting**
Show the RoundTicket with:
- Entry price and accepted timestamp.
- Latest available price and live delta labelled "not final".
- Minimum-wait countdown ring (yellow, fills over 60 s).
- Step tracker: Placed → Waiting → Comparing → Result.
- Label "Minimum wait — Not final. Moves during this minute don't count."

**After countdown — Checking / Equal / Outage**
At timer zero show "Comparing prices". Do not invent a result.
Show state-specific copy only when the backend reports that reason:
- `checking`: "Minimum wait complete. We're checking the latest price."
- `unchanged`: "The latest price equals your entry price. Still waiting."
- `price_unavailable`: "Our price source is temporarily unavailable.
  Your round is on hold, and an outage never counts as a loss."
A stale display feed alone does not establish the resolver's status.
Use amber / neutral styling for holds, never red.

**Results**
Show ResultReceipt with: "Correct" or "Not this time", score delta (+1 / −1),
direction called, entry price, compared price, accepted and settled timestamps,
elapsed duration, and a note that exact prices are used, not rounded display values.
If rounded receipt values hide the winning difference, show enough precision
to explain the actual comparison.
Flash the score number once on settlement.
Show a result once per prediction, including after browser return.
Re-enable direction buttons only after backend-confirmed resolution.

**Error and recovery**
- Player setup / restoration failure: show retry notice; do not create a
  replacement player on a temporary network failure.
- Submission outcome unknown: lock controls and attempt to reconcile with
  the same idempotency key; never claim nothing was recorded before a
  definitive server rejection.
- Stale market: show last known price as stale; disable new submissions.
- Player-state failure: mark score as "last confirmed" and conservatively
  block new submissions until reconciled.

### Score copy

Use exactly: "Your score is saved on our server. This browser remembers
your anonymous player."

Do not say "Saved to this browser" — that implies the wrong ownership.
Explain separately that clearing browser storage or switching devices loses
anonymous access.

### Polling and data freshness

Market polling: approximately 5 s interval, configurable.
Player-state polling: approximately 2 s while a round is active,
approximately 3 s otherwise; approximately 1 s near the deadline.
Refetch on window focus return and after mutations.
Avoid overlapping requests.

Status labels:
- Live feed: "Latest available" or "Updated X seconds ago · Coinbase"
- Stale feed: "Last known price, updated X seconds ago · Coinbase"
- Unavailable: show error notice; preserve last known value

Do not imply a streaming feed. No WebSockets required for MVP.

### Motion

All animation is disabled under `prefers-reduced-motion`; state remains
communicated through text and icons alone.

| Moment | Treatment | Rationale |
|--------|-----------|-----------|
| Price tick | Small up/down arrow badge; price number stays white | Shows last-move direction without colouring the price |
| Chart live dot | Soft ping every 2 s while live; stops when delayed | Marks "now" on the chart |
| Live pill dot | Pulses every 2 s | Distinguishes live from delayed at a glance |
| Minimum-wait ring | Yellow arc fills over 60 s around the timer | Makes the core mechanic physical |
| Comparing | Small spinner | Waiting on the server, not a timer |
| Score change | Number background flashes green or red once, fades over ~1 s | Connects the receipt to the running score |

### Accessibility

- Use native HTML controls (`<button>`, `<details>`) rather than custom roles.
- Minimum touch target: 44 × 44 px. Direction buttons are 76 px tall.
- Visible focus ring: 2 px solid `--accent` (#F2C14E) with 2 px offset.
- After placing a prediction, move focus to the round heading so keyboard
  users do not land on a removed button.
- Polite live region announces:
  - Placement confirmation with direction and entry price.
  - End of minimum wait ("Minimum wait complete. Checking the latest price.").
  - Equal-price or outage hold with score-safety reassurance.
  - Result with outcome and new score total.
  - Do not announce every price tick or countdown second.
- Direction and outcome use arrow icons plus words; never colour alone.
- Chart has a text alternative (`aria-label` on the SVG).
- Prices and timers use tabular figures so layouts do not shift.

### History placeholder

Basic rules explanation (`HowItWorks`) is MVP functionality, present from T02.
Persisted, paginated round history is T11.

Before T11 is complete, use an honest placeholder such as
"Your settled predictions will appear here" or omit the history card.
Never tell an existing player they have no rounds just because the
history feature is not yet wired.

### Prototype boundaries

The HTML prototype uses a seeded random price walk, an in-page mock server,
fake in-memory credentials, fixed RPC delays and simulated tab closure.
It is a design reference, not proof of backend correctness.

The following prototype behaviours must NOT appear in production:

- Seeded random price walk or any synthetic market data.
- In-page mock server, scenario controls, time skips or speed multipliers.
- Fake in-memory credential store (production uses browser localStorage +
  DynamoDB).
- Integer-cent precision assumption: use decimal-safe string prices at all
  storage and API boundaries; show additional precision in receipts when
  rounded values would hide the outcome.
- Full player history in every `/me` response: return active prediction
  and an identifiable latest result only; paginate history in T11.
- Synthetic two-minute chart history: collect validated display-price
  samples in memory from page load only; start with an empty chart and
  "Collecting recent prices"; do not invent earlier points.
- Simulated polling intervals as production configuration: the prototype's
  polling shape is illustrative; tune actual intervals from observed cost
  and latency.

## Optional modes

These are proposed defaults, to be confirmed before implementation.

### Momentum Double Down

- Eligible after a standard win.
- Offer lasts 10 seconds.
- Same direction, new entry quote, new minimum 60-second round.
- Original +1 remains settled.
- Bonus score delta: +2 or -2.
- Combined pair: +3 or -1.
- One acceptance; no chains.

### Redemption Round

- Eligible after a standard loss.
- Original -1 settles immediately.
- Offer lasts 10 seconds.
- Player chooses direction for a fresh round.
- Target combined result: +3 or -3.
- Bonus score delta: +4 on win or -2 on loss.
- Decline/expiry leaves original -1.
- No chains.

Both:
- Backend owns eligibility and expiry.
- Acceptance is conditional and single-use.
- Respect one active prediction.
- Use separate feature flags.
- Explain exact arithmetic before acceptance.
- No real money.

## Product hypotheses

History and clear settlement details may improve trust.
Optional continuation may increase repeat engagement.

Measure:
- Prediction completion rate.
- Repeat predictions per player.
- Offer acceptance and completion.
- Settlement delay and operational failures.

Visitor activation and retention require appropriate frontend
exposure/session measurement; backend logs alone are insufficient.

Do not claim these experiments produce revenue without evidence.

## Verification

Test pure rules without sleeping.
Inject clocks and price providers.
Test DynamoDB concurrency conditions with an isolated datastore.
Use one deterministic browser journey.
Manually smoke-test real deployed 60-second resolution.

## Operational runbook

Populate with actual resource names and commands after deployment.

Investigation:
1. Identify prediction ID.
2. Inspect prediction and player state.
3. Find workflow execution and correlated logs.
4. Determine provider, startup or settlement failure.
5. Correct the cause.
6. Redrive/replay through the supported recovery mechanism.
7. Confirm one recorded outcome and one score effect.

Security:
- Keep credentials out of Git.
- Redact tokens in logs.
- Restrict IAM to required resources.
- Configure CORS for intended origins.
- Treat CORS as browser policy, not authentication.

Costs:
- Use modest polling intervals.
- Set log retention.
- Enable billing alerts.
- Document teardown and retained data before submission.

## Decision log

Decisions agreed during the T01 Grill Me review.
Record format: decision, reason, alternatives considered, tradeoff or limitation.

---

### D1 — Resolution price: first valid differing ticker poll after deadline, with trade timestamp recorded

**Decision.**
Settle the round on the first Coinbase ticker response after `dueAt` whose
price differs from the entry price. Store both the settlement price and the
exchange-reported trade timestamp (`time` field from the ticker response) as
`resolutionTradeTime` on the Prediction record.

**Reason.**
The ticker's `time` field is the exchange timestamp of the last trade,
not the Lambda fetch time. Storing it lets the result receipt show players
exactly when the compared trade occurred, proving the 60-second rule was
satisfied without requiring them to trust the fetch timestamp alone.
This satisfies the "every number has a source" design principle at negligible
extra cost: one additional field parsed and stored.

**Alternatives considered.**
- Ticker poll only, no trade timestamp (Option A): simpler, but the receipt
  cannot prove the compared price is post-deadline without showing fetch time,
  which can be slightly later than the trade.
- Coinbase 60-second candle close (Option B): more auditable candle boundary,
  but candle data can lag by up to 60 seconds, equal-price retry becomes
  significantly harder, and it requires a second API shape with its own
  validation.

**Tradeoff or limitation.**
The trade timestamp comes from the Coinbase API response and is trusted as
received. It is not independently verified. Settlement still requires a
differing price; a trade at exactly the entry price keeps the round pending.
The resolver may fetch the ticker a few seconds after `dueAt`, so the
compared trade may be up to a few seconds post-deadline rather than exactly
at second 60.

---

### D2 — Workflow startup: synchronous StartExecution inside createPrediction, with a scheduled recovery scanner

**Decision.**
After writing the Prediction to DynamoDB, the createPrediction Lambda calls
`sfn:StartExecution` synchronously using the execution name
`prediction-{predictionId}`. A separate recoverStuckPredictions Lambda runs
every five minutes on a CloudWatch schedule. It finds any Prediction in
status `pending` whose `dueAt` is more than two minutes past and for which
no active execution exists, then calls `StartExecution` with the same
deterministic name. `StartExecution` is idempotent on a given execution
name, so duplicate calls are safe.

**Reason.**
The original design used a DynamoDB Stream to decouple the DB write from
the workflow start. That approach is reliable but adds substantial
complexity: stream enablement, event-source mapping, delivery filtering,
at-least-once handling, a dead-letter queue, and a test environment that
can emulate stream delivery. The synchronous call achieves the same
correctness for the common path. The failure window (Lambda crashes after
DB write, before StartExecution) is narrow and handled by the recovery
scanner rather than infrastructure plumbing.

**Alternatives considered.**
- DynamoDB Streams + startPredictionWorkflow Lambda (original design):
  near-automatic recovery, but higher infrastructure complexity, harder to
  test locally, and more moving parts to explain.

**Tradeoff or limitation.**
A prediction stuck in `pending` is not recovered until the next scanner
run (up to five minutes). During that window the player's UI will show the
round as active past the deadline. The scanner must be monitored and its
failures alerted. This is an operationally acceptable tradeoff at MVP
scale; revert to a stream-based approach if throughput or recovery-latency
requirements increase.

---

### D3 — Anonymous token: randomBytes(32), SHA-256 storage, timingSafeEqual verification

**Decision.**
Generate the access token with `crypto.randomBytes(32).toString('hex')`
(256 bits of entropy). Return the raw token to the browser once in the
`POST /players` response body. Store only its SHA-256 hash on the Player
record in DynamoDB. Verify incoming tokens by hashing the presented value
and comparing with `crypto.timingSafeEqual`.

**Reason.**
256 bits of entropy makes the token computationally unguessable; no
dictionary or brute-force attack is feasible. Storing only the hash means
a DynamoDB breach exposes no usable secrets — the raw tokens exist only in
players' browsers and in the single HTTP response that created them.
SHA-256 (not bcrypt) is appropriate because token entropy is high; slow
hashing is only needed for low-entropy human-chosen passwords. Using
`timingSafeEqual` closes timing-attack vectors at no cost.

**Alternatives considered.**
- UUID v4: 122 bits of entropy, also sufficient, but conventionally used
  as identifiers not secrets. Using the same format for ID and token
  obscures intent.
- bcrypt for hashing: adds a dependency and 100–300 ms to every
  authenticated request with no security benefit given the token entropy.
- Storing the raw token: eliminates the hash step but means a DynamoDB
  breach directly compromises all players.

**Tradeoff or limitation.**
If a player's `localStorage` is cleared, their token is gone and the
account is inaccessible. The DynamoDB record remains orphaned. This is
a documented limitation of anonymous, device-local identity — not a
fixable bug without introducing accounts.

---

### D4 — Idempotency: browser-generated UUID key, backend stores (playerId, key, direction, predictionId), two 409 codes

**Decision.**
Before submitting a prediction, the browser generates an idempotency key
with `crypto.randomUUID()`. The key is included in the request body and
reused on any retry of the same submission. The backend stores one
Idempotency record per `(playerId, idempotencyKey)` containing the
direction, the created `predictionId`, and a 24-hour TTL. A second
request with the same key returns the stored prediction without re-running
creation logic. A second request with the same key but a different
direction returns `409 IDEMPOTENCY_CONFLICT`.

Concurrent submissions from different tabs use different keys and both
reach the prediction creation transaction. The transaction condition
(player must have no `activePredictionId`) ensures only the first to land
succeeds; the second receives `409 ACTIVE_ROUND`.

**Reason.**
A lost HTTP response (backend succeeded, browser never received it) is a
realistic failure mode on mobile networks. Without idempotency, a retry
creates a duplicate prediction and potentially double-scores. The key lets
the backend recognise a retry and return the original result safely.
`crypto.randomUUID()` is available in all modern browsers with no library
dependency. The transaction condition is the authoritative enforcement
mechanism for one-active-prediction; application-level locking is not needed.

**Alternatives considered.**
- Server-generated idempotency key: requires a pre-registration round
  trip before every prediction. More complex with no benefit over
  client-generated UUIDs for this use case.
- Optimistic locking only (no idempotency record): prevents double-creation
  from concurrent tabs but does not handle the lost-response/retry case.

**Tradeoff or limitation.**
Idempotency records are stored per player and expire after 24 hours.
A player who loses their response and retries after 24 hours would
create a new prediction rather than recovering the original. This window
is acceptable for a game with 60-second rounds.

---

### D5 — Accuracy stats (wins, losses, accuracy %) included in MVP ScoreCard

**Decision.**
The Player record stores `wins` and `losses` counts alongside `score`.
Both are initialised to 0 on player creation and incremented atomically
in the settlement transaction. `GET /me` returns all three values.
The ScoreCard displays accuracy percentage and wins/losses counts after
the first settled round. For new players with no settled rounds, only
the score and a brief explanation are shown.

The recovery scanner (`recoverStuckPredictions`) is built and deployed
as part of T08, not deferred to T10. All workflow reliability work —
startup, resolution, recovery — lives in one ticket.

**Reason.**
The prototype already shows accuracy stats and the data needed (wins,
losses) is a trivial addition to the settlement transaction. Deferring
it would require a data migration later. Including it at MVP means the
ScoreCard is honest and complete from the first real round.
The recovery scanner belongs in T08 because T08 owns the full
resolution lifecycle; splitting it into T10 would leave T08 in a state
where stuck predictions have no recovery path during production testing.

**Alternatives considered.**
- Score only at MVP, stats at T11: avoids adding wins/losses to the
  data model early, but requires a backfill for existing players.
- Recovery scanner at T10: keeps T08 smaller but leaves a gap in
  production reliability between T08 and T10 verification.

**Tradeoff or limitation.**
Accuracy percentage is only meaningful after several rounds. For a player
with one round it shows 100% or 0%, which is technically correct but not
very informative. The ScoreCard hides stats until at least one round
is settled to avoid this edge case looking odd.