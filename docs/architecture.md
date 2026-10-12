# Architecture

## Status

T11, T12, and T13 are complete locally. Redemption is not deployed. Mario confirmed history on 2026-10-11 and marked Double Down done the same day. Both optional flags default off. `yarn dev:local` defaults each one on when its variable is unset. The hosted site `https://release.d2yczmbttcpoe9.amplifyapp.com` still shows the T10 build until the next API deploy and Amplify rebuild. History, Double Down, and Redemption are in the packaged template and are not in the account until that deploy. A deploy leaves Double Down off unless it passes `--param doubleDown=on`, and leaves Redemption off unless it passes `--param redemption=on`. T10's hosted check still stands: on 2026-10-11 Mario pressed Up, closed the tab while the round was running, and reopened after 5 minutes. The round had settled as a loss. The fuller pass before submission remains the hosted list under T14.

## Product goal

A player should understand the game quickly, trust the result and
return to their saved progress without needing to register.

The standard prediction loop is the game. Momentum Double Down is an optional continuation after a standard win. Redemption is an optional continuation after a standard loss. Each one is off until a deploy passes `--param doubleDown=on` or `--param redemption=on`.

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

- **Player ID** — `anon_` plus 8 hex characters (for example `anon_ab12cd34`).
  The shorter `anon_7F3A` form in early notes is only an illustration.
  Public. Returned to the browser and stored in DynamoDB. A colliding id
  is rejected by a conditional write and the create call tries a new id.
- **Access token** — `crypto.randomBytes(32).toString('hex')`, 64 hex
  characters, 256 bits of entropy. Secret. Returned to the browser in
  the response body once and never stored on the server.

The browser saves both in `localStorage` under `hunch.session`. Every
authenticated request sends `Authorization: Bearer <playerId>.<accessToken>`.

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
  Public display quote. Returns `price`, `source: COINBASE_EXCHANGE`, `fetchedAt`, `tradeTime`, and `isFresh`. No player token. Provider failure is `503 PROVIDER_UNAVAILABLE`. This quote is not a settlement input.

- POST /predictions
  Implemented. Accepts `direction` (`UP` or `DOWN`) and a UUID `idempotencyKey`. The server records the entry price, trade time, `createdAt`, and `dueAt` (`createdAt` plus 60 seconds). A new round is `201`. The same key and direction is `200` with the stored prediction. The same key and other direction is `409 IDEMPOTENCY_CONFLICT`. A different key while a round is open is `409 ACTIVE_ROUND`. A provider failure, or an entry trade older than 10 seconds, is `503 PROVIDER_UNAVAILABLE` and writes nothing. Client `entryPrice`, `createdAt`, and `score` are ignored.

- GET /predictions
  Implemented. Returns the authenticated player's settled rounds, newest first. `limit` is an integer from 1 to 50 and defaults to 20. `cursor` is the base64url encoding of the last returned sort key. The handler rebuilds the DynamoDB key with the authenticated player id, so a cursor cannot read another player's partition. A cursor that is not `PREDICTION#p_` plus 13 digits, `_`, and 8 hex characters is `400 INVALID_INPUT`. Pending rounds are omitted. `nextCursor` is null when that player's resolved rounds are exhausted.

- POST /offers/{offerId}/accept
  Implemented. Body is `{ idempotencyKey, direction? }`. Double Down ignores a client direction and uses the direction stored on the offer. Redemption requires `direction` of `UP` or `DOWN`. A missing or invalid direction is `400 DIRECTION_REQUIRED` and writes nothing, so the offer stays open. The follow-on round uses that direction, a fresh entry quote, `mode` from the offer, and `dueAt` 60 seconds after `createdAt`. The same key, the same offer, and the same direction returns the stored round. The same key with a different direction, another offer, or a standard create is `409 IDEMPOTENCY_CONFLICT` with the message “This idempotency key was already used”. A provider failure or a trade older than 10 seconds writes nothing and leaves the offer open.

- POST /offers/{offerId}/decline
  Implemented. No body. Decline is conditional and a second decline returns the declined offer.

- POST /offers/{offerId}/extend
  Implemented. No body. Adds 20 seconds, at most 10 times, so the longest offer is 210 seconds. The update requires the offer to still be open, not yet due, under the cap, and still on the deadline just read.

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
An equal price returns `EQUAL_PRICE`. `evaluate()` still returns a
score delta of exactly `+1` or `-1`. `scoreDelta(mode, outcome)` maps
`STANDARD` to ±1, `DOUBLE_DOWN` to ±2, and `REDEMPTION` to +4 or −2.
Both bonus modes read from one table, `OFFER_RULES` in
`packages/contracts/src/offerRules.ts`: the trigger outcome, the payout,
and whether the direction is fixed. The API, the UI, and the fixtures
all take their numbers from it.

`GET /me` returns `activePrediction`, `latestResolvedPrediction`
(identified by `predictionId`), `serverTime`, and `waitReason`.
`waitReason` is `WAITING_FOR_DEADLINE`, `CHECKING_PRICE`, `EQUAL_PRICE`,
`PROVIDER_HOLD`, or `null`. The UI must use that field. It must not
infer an equal-price or provider hold from the display quote.
Display freshness is `MarketResponse.isFresh` only.

`POST /players` returns `playerId` and a 64-hex-character access token
once. `POST /predictions` takes `direction` (`UP` or `DOWN`) and a UUID
`idempotencyKey`. A prediction also includes `mode: STANDARD` and
`entryTradeTime`. If that response is lost, send the same body again.
Do not mint a new key until the server answers or rejects the request.

Error codes: `INVALID_INPUT`, `UNAUTHORIZED`, `ACTIVE_ROUND`,
`IDEMPOTENCY_CONFLICT`, `PROVIDER_UNAVAILABLE`, `OFFER_EXPIRED`,
`OFFER_ACCEPTED`, `OFFER_DECLINED`, `OFFER_REPLACED`, `MAX_EXTENSIONS`,
`OFFER_NOT_FOUND`, and `DIRECTION_REQUIRED`. Offer conflicts are 409.
A missing offer, another player's offer, or an offer whose mode flag is
off is 404 `OFFER_NOT_FOUND`. `DIRECTION_REQUIRED` is 400. Only
`PROVIDER_UNAVAILABLE` is in `RECOVERABLE_ERROR_CODES`.

`GET /me` also returns `offer` and `features`, with `doubleDown` and
`redemption`. `offer` is the latest offer while it is open, and for 60
seconds after its deadline, and only when that offer's mode flag is on.
After that it is null. The offer includes `mode`, `direction` (null when
the player has not chosen), `payout` (`win`, `loss`, `parentDelta`), and
`chosenDirection` after a Redemption accept. `payout` is read from
`OFFER_RULES`. It is not stored. A resolved follow-on includes
`parent: { predictionId, scoreDelta }`, which is +1 for Double Down and
−1 for Redemption. `FEATURE_DOUBLE_DOWN` is on only when the Serverless
param `doubleDown` is `on`. `FEATURE_REDEMPTION` is on only when
`redemption` is `on`. Both default off.

## Proposed data model

Use one DynamoDB table named `hunch-<stage>`. Partition key `pk` and sort key `sk` are strings. Billing is on-demand. Streams are off. The first index is the sparse GSI `pending-by-due`: hash `pendingKey`, range `pendingDueAt`, keys only. Pending predictions set `pendingKey = PENDING` and `pendingDueAt = dueAt`. Settlement removes both. Player history is a Query on that player's partition, `begins_with(sk, PREDICTION#)`, newest first, with a consistent read. It has no index and must not scan the table. The dev table is retained if the stack is deleted. TTL is enabled on `expiresAt` and is set only on idempotency items, 24 hours after creation. The health and market Lambdas cannot read or write the table. Player Lambdas can `GetItem` and `PutItem` only. The history Lambda can `GetItem` and `Query` on the table ARN only. It cannot query the index, scan, or write. IAM cannot limit that Query to one partition; the handler sets `pk` from the authenticated player id. The prediction Lambda can `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems`, and can `states:StartExecution` on `hunch-<stage>-resolution`. The resolver can `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems` on the table. `PutItem` is required because a winning settlement also puts the offer. It cannot query or scan. The offer Lambda (`hunch-<stage>-offers`) can `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems`, and can `states:StartExecution` on the resolution machine. It cannot scan. The recovery Lambda can `Query` only `pending-by-due`, plus `StartExecution` and `ListExecutions` on the state machine and `DescribeExecution` on its executions.

A player item uses `pk = PLAYER#<playerId>` and `sk = PLAYER`. The raw access token is not stored. `GET /me` loads `activePrediction` when `activePredictionId` is set. `waitReason` is `WAITING_FOR_DEADLINE` before `dueAt`. After `dueAt` it is `EQUAL_PRICE` or `PROVIDER_HOLD` only when `lastCheck` is less than 30 seconds old. Otherwise it is `CHECKING_PRICE`. `latestResolvedPrediction` is loaded from `latestResolvedPredictionId` when that prediction is `RESOLVED`.

Player:
- playerId
- accessTokenHash
- score
- wins          (count of correct predictions; displayed in ScoreCard at MVP)
- losses        (count of incorrect predictions; displayed in ScoreCard at MVP)
- activePredictionId
- latestResolvedPredictionId
- openOfferId
- latestOfferId
- createdAt

`openOfferId` is set when a standard win creates a Double Down offer or a standard loss creates a Redemption offer, and removed on accept, decline, or replace. `latestOfferId` stays so `GET /me` can still show the offer after it ends. An offer item uses `pk = PLAYER#<playerId>` and `sk = OFFER#<offerId>`. `offerId` is `o_` plus the parent prediction id. The deadline is an ISO string named `expiresAt`. It must not be a number: the table TTL deletes numeric `expiresAt`, and that attribute is only for idempotency rows. Expiry is not written as a status. `OPEN` with `now >= expiresAt` is expired when the offer is read. A standard create while the offer is still open sets `REPLACED` in the same transaction. That replace still runs when the flag is off, so a leftover offer cannot trap the player. Accept and create cannot both succeed: accept sets `activePredictionId` only when none exists, and create requires that none exists.

Prediction item: `pk = PLAYER#<playerId>`, `sk = PREDICTION#<predictionId>`. `predictionId` is `p_`, a 13-digit epoch millisecond value, `_`, and 8 hex characters.

Prediction:
- predictionId
- playerId
- direction (`UP` or `DOWN`)
- mode (`STANDARD`, `DOUBLE_DOWN`, or `REDEMPTION`)
- status (`PENDING` or `RESOLVED`)
- pendingKey (`PENDING` while unresolved; removed on settlement; not an API field)
- pendingDueAt (same instant as `dueAt` while unresolved; removed on settlement; not an API field)
- lastCheck (`EQUAL_PRICE` or `PROVIDER_HOLD`, plus the check time; removed on settlement)
- createdAt
- dueAt
- entryPrice
- entryTradeTime
- entryFetchedAt
- resolvedAt
- resolutionPrice
- resolutionTradeTime   (exchange timestamp of the compared trade, from the Coinbase ticker `time` field)
- resolutionFetchedAt
- outcome
- scoreDelta
- parentPredictionId, optional

Idempotency item: `pk = PLAYER#<playerId>`, `sk = IDEMPOTENCY#<idempotencyKey>`.

Idempotency record:
- playerId
- idempotencyKey
- direction
- predictionId
- createdAt
- expiresAt (epoch seconds, 24 hours)

Offer, optional:
- offerId
- playerId
- parentPredictionId
- mode (`DOUBLE_DOWN` or `REDEMPTION`; an old item with no mode reads as `DOUBLE_DOWN`)
- direction, optional (the parent direction on Double Down; omitted on an open Redemption offer)
- chosenDirection, optional (set when a Redemption offer is accepted)
- expiresAt
- status
- acceptedPredictionId

Query player history on the player partition, newest first. Do not scan the whole table. There is no history index.

## Price handling

Keep prices as decimal strings in storage and API contracts.
Use a decimal-safe implementation for comparison.
Formatting/rounding is only for display.

Store provider observation time where available and fetchedAt.
Reject malformed or unusably stale settlement data.

Display freshness, implemented with `GET /market`:

- `fetchTicker` calls the public Coinbase Exchange BTC-USD ticker, sends a User-Agent, and aborts after 3 seconds. It validates `price` as a positive decimal string and `time` as an ISO datetime. Coinbase microseconds are trimmed to milliseconds. This function is uncached so entry and resolution quotes can reuse it.
- `isFresh` is true when the trade time is at most 60 seconds before the Lambda clock.
- `displayQuote` keeps one successful quote for about 3 seconds in a warm Lambda. Failures are not cached. A provider failure returns 503. The browser keeps the last price and labels it Delayed.
- The browser polls about every 5 seconds. It shows Delayed when the latest poll failed, `isFresh` is false, or the last good sample is more than 15 seconds old by the browser clock. Age is measured from when this browser received the quote.
- The chart stores fresh samples from the current page only, for about 10 minutes. It does not invent earlier history. The 1-minute change stays hidden until a sample is at least 60 seconds old.

Entry and resolution quotes call `fetchTicker`, not `displayQuote`. An entry trade older than 10 seconds is unusable. That failure returns `503` and does not write a round. Display freshness stays 60 seconds and does not decide whether an entry quote is accepted.

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
direction:      "UP" | "DOWN"
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

`TransactWriteItems` applies all of the following atomically, or none:
- Put the Prediction item if that key is absent.
- Set `activePredictionId` only if the player item exists and `activePredictionId` is absent.
- Put the Idempotency item if that key is absent.

A failed idempotency condition is a duplicate key and returns the stored prediction. A failed player condition is `409 ACTIVE_ROUND`. The transaction, not a check in application code, is what enforces one active prediction. A pre-check avoids a Coinbase call when the player is already locked. Two simultaneous requests with different keys can both fetch a quote; only one transaction lands.

### Settlement transaction

Implemented as one `TransactWriteItems`, or none of it:
- Update the prediction only while `status` is `PENDING`. Set `RESOLVED`, the outcome, `scoreDelta`, `resolutionPrice`, `resolutionTradeTime`, `resolutionFetchedAt`, and `resolvedAt`. Remove `pendingKey`, `pendingDueAt`, and `lastCheck`.
- Update the player only while `activePredictionId` is this prediction. Add `score` and either `wins` or `losses`. Set `latestResolvedPredictionId`. Remove `activePredictionId`.

A cancelled transaction means the round was already settled. The handler returns the stored outcome and does not apply the score again. If the player lock no longer matches, the resolver clears the index attributes and does not score. The in-memory store used by tests and `yarn dev:local` performs the same check and both writes with no await between them.

## Workflow startup and recovery

After a newly stored round, createPrediction calls `sfn:StartExecution` with the name `prediction-{predictionId}` and input `{ playerId, predictionId, dueAt }`. The `prediction.created` log includes `executionName`, `priorRounds`, and `repeat`. `repeat` is `true` when the player already had at least one settled round. These fields count creations. They are not a retention or activation measurement. `ExecutionAlreadyExists` is success. Any other start failure is logged as `prediction.workflow_start_failed` and the handler still returns 201. A metric filter on that log raises `hunch-<stage>-workflow-start-failed`. An idempotent replay of the create request does not start a second workflow. If the Lambda crashes after the write and before the start, no execution exists until the scanner runs.

The machine is `hunch-<stage>-resolution`. It waits until `dueAt`, then invokes the resolver. `SETTLED`, `ALREADY_SETTLED`, and `ORPHANED` succeed. `EQUAL_PRICE` waits 5 seconds and tries again. `PROVIDER_HOLD` waits 15 seconds. `TOO_EARLY` returns to the deadline wait. Lambda task failures retry with backoff, at most 6 times. The execution timeout is 21600 seconds (6 hours). Resolution calls `fetchTicker`, not the display cache. The clock is checked against `dueAt` before any quote. A provider error or a trade older than 10 seconds is `PROVIDER_HOLD`, never a loss. `evaluate()` uses the exchange trade time as `resolvedAt`, so that trade must itself be at least 60 seconds after `createdAt`.

### Local memory and DynamoDB

There is no environment flag that switches the store. The handler functions take a store argument. The file that calls them chooses which store to pass.

`yarn dev:local` sets `VITE_API_BASE_URL=/api`. The Vite plugin in `apps/web/vite.config.ts` runs only while Vite is serving. It loads `apps/api/src/localDev.ts`. `createLocalApp()` calls `memoryGameStore()` once and keeps that object for the process. It passes the same object into `handleCreatePlayer`, `handleMe`, and `handleCreatePrediction`. `yarn dev` leaves the API address empty, so the browser talks to the deployed API instead of this plugin.

Each Lambda export builds its own DynamoDB stores. The `handler` in `apps/api/src/handlers/createPrediction.ts` calls `dynamoPlayerStore()` and `dynamoPredictionStore()`. Those functions read `TABLE_NAME` and open a DynamoDB client. `createPlayer`, `me`, and `resolvePrediction` do the same. Tests inject `memoryGameStore()` the same way the Vite app does.

Local settlement is `scheduleResolution`: a `setTimeout` in the Vite process that waits until `dueAt`, then calls `handleResolvePrediction`. AWS settlement is `startPredictionWorkflow`, which starts the Step Functions execution. Both paths call the same resolver, with the same 5-second equal-price wait and the same 15-second provider wait. The production wait stays 60 seconds. The local path does not call AWS.

Entry and resolution prices on both paths come from the real Coinbase ticker through `fetchTicker`. The memory object holds players, rounds, and scores until the dev server stops. Restarting it drops them. The browser still has `hunch.session`, so the next load rejects that player until **Start a new player**. `POST /api/__dev/next-prediction` arms the next local fault and exists only on the Vite app.

Recovery: `recoverStuckPredictions` runs every five minutes. It queries `pending-by-due` for `pendingDueAt` before now minus 2 minutes. It does not scan the table and it does not write a score. Each run lists `RUNNING` executions once. It skips a prediction when the base execution is running or has succeeded, and also when any running name is `prediction-{predictionId}` or starts with `prediction-{predictionId}-`. A missing execution starts under `prediction-{predictionId}`. A failed, timed-out, or aborted execution cannot be restarted under the same name, because Step Functions keeps a finished name for 90 days, so the scanner starts `prediction-{predictionId}-r{epochMinutes}` only when no recovery execution for that prediction is still running. Each prediction logs `prediction.recovery` with `predictionId`, `playerId`, `state`, `action`, and `executionName`, then one summary line with `found` and `started`. Settlement stays conditional, so a second execution cannot score twice.

Worst case, a round whose workflow never starts becomes eligible 2 minutes after `dueAt` and is seen on the next 5-minute tick, about 7 minutes after `dueAt` and under 5 minutes after it became eligible. The schedule is not tighter than that.

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
5. RoundHistory
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
| RoundTicket | Active round: "You called" heading, phase eyebrow, wait dial, entry / latest / vs-entry figures, step tracker, and a note that the round keeps running if the page is closed |
| ResultReceipt | Outcome badge, score delta, entry/compared price, timestamps |
| ScoreCard | Numeric score; after the first settled round also shows accuracy %, wins and losses counts, labelled as all settled rounds |
| RoundHistory | Settled prediction list with loading, empty, error, and populated states |
| HowItWorks | Expandable accordion; basic rules from T02, plus where settled rounds are listed |
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
Show one RoundTicket section, labelled by the "You called Up/Down" heading:
- Phase eyebrow: Minimum wait, Comparing prices, Price unchanged, or On hold, plus the round id. A follow-on round names Double Down or Redemption in that eyebrow.
- Dial: a countdown (`m:ss`) whose ring fills over 60 seconds while waiting; a spinning arc while comparing; an equal mark when the price is unchanged; a pause mark on provider hold. Reduced motion stops the arc.
- Three figures: entry price and accepted time, latest price labelled "Not final", and the move versus entry (ahead, behind, or level).
- Step tracker: Placed → Waiting → Comparing → Result. The current step has `aria-current="step"`.
- Footer: "You can close this page. The round keeps running."
- After the minimum wait, "Checked Ns ago" is the age of the last successful player poll, not a settlement time.
- Waiting copy: "Not final. Earliest result" plus the deadline time.

**After countdown — Checking / Equal / Outage**
At timer zero show "Comparing prices". Do not invent a result.
Show state-specific copy only when the backend reports that reason:
- `checking`: "We're checking the latest price." The spoken transition is still "Minimum wait complete. Checking the latest price."
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
Player-state polling, as built: 2 s while a round is active, 3 s when idle, and 1 s when the round is within 5 s of `dueAt` or the server reports checking, an equal price, or a provider hold. Polling pauses while the tab is in the background. Focus always refetches `/me`. TanStack Query does not start a second interval fetch for that query while one is in flight. `/me` aborts after 8 seconds.

The countdown offset is `serverTime − (t0 + t1) / 2`, where `t0` and `t1` are the client times just before and just after `/me`. The ring uses `Date.now() + offset`.

If `/me` fails after a player has loaded, the score is labelled Last confirmed, Up and Down stay disabled, and a warn notice offers Retry. Polling continues. A first load with no player yet keeps the existing retry notice. A rejected token still offers a new player.

One polite live region announces a placement, the end of the minimum wait, an equal-price or provider hold, and a result with the new score. It does not announce price ticks or countdown seconds. The score flash and the result announcement run once per prediction. The browser stores that id at `hunch.seenResult.<playerId>`. If storage throws, the marker stays in memory for the page. Offer ids the tab has shown, for both modes, are the last 10 values at `hunch.seenOffers` in `sessionStorage`. If that write throws, the same list stays in memory for the page. An ended offer this tab has seen can show its notice after a refresh. An ended offer this tab has not seen shows nothing. The receipt stays on screen until the next round is placed.

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

### Round history

`GET /predictions` returns settled rounds only. The list shows direction, entry time, both prices, elapsed time, and +1 or −1, with the words Correct or Not this time. When the rounded prices hide a difference, the row also shows the exact price strings. Loading uses two skeleton rows. The empty copy appears only after a successful empty response. A failed load keeps any rows already shown and offers Retry. Load older rounds requests the next page of 20. Accuracy on the score card is all settled rounds, from `wins` and `losses` on `GET /me`, not from the loaded page.

`prediction.created` includes `priorRounds` (`wins + losses` before that round) and `repeat` (`true` when that count is greater than 0). An idempotent replay does not log another creation. `prediction.settled` is unchanged. These log counts are not proof of retention or activation.

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
  and an identifiable latest result only. Settled history is paginated
  on `GET /predictions`. T11 is complete locally.
- Synthetic two-minute chart history: collect validated display-price
  samples in memory from page load only; start with an empty chart and
  "Collecting recent prices"; do not invent earlier points.
- Simulated polling intervals as production configuration: the prototype's
  polling shape is illustrative; tune actual intervals from observed cost
  and latency.

## Optional modes

Momentum Double Down and Redemption are both implemented locally and off by default.

### Momentum Double Down

Implemented locally. A `STANDARD` win creates one offer only when `FEATURE_DOUBLE_DOWN` is `on`. `issuedAt` is that settlement's `resolvedAt`. The first deadline is 10 seconds later. Need more time adds 20 seconds, at most 10 times. Accept starts `DOUBLE_DOWN` in the parent's direction. `evaluate()` stays ±1. `scoreDelta(mode, outcome)` maps a bonus round to ±2. The original +1 is never rewritten. A bonus win does not create another offer. `wins` and `losses` still increase by 1 per settled round, including a bonus round. Decline sets `DECLINED`. The settlement transaction puts the offer once; a repeated settle returns `already_settled`.

### Redemption Round

Implemented locally. Mario marked the local check done on 2026-10-11. A `STANDARD` loss creates one offer only when `FEATURE_REDEMPTION` is `on`. The offer has no direction. The original −1 is already settled and is not rewritten. The window, the extension, and the single-use accept are the same offer path as Double Down. Accept starts `REDEMPTION` in the direction the player sends. `scoreDelta` maps a win to +4 and a loss to −2. The pair totals are +3 and −3. Decline, expiry, and a replacement standard round leave the −1. A Redemption settlement creates no further offer. The visible name is the constant `REDEMPTION_NAME` in `apps/web/src/featureNames.ts`, currently `Redemption`. See D8.

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

`yarn dev:local` is the in-memory entry point described under **Local memory and DynamoDB**. It does not emulate API Gateway, IAM, or the display cache. Production handler tests cover token hashing and the market response. The next deploy is what proves the AWS settings.

## Operational runbook

These names exist after the T08 deploy of stage `dev` in `eu-north-1`. They are defined in the packaged template and are not in the account until that deploy.

- Table `hunch-dev`, index `pending-by-due`.
- State machine `hunch-dev-resolution`.
- Functions `hunch-dev-resolvePrediction`, `hunch-dev-recoverStuckPredictions`, `hunch-dev-getPredictionHistory`, `hunch-dev-acceptOffer`, `hunch-dev-declineOffer`, and `hunch-dev-extendOffer`.
- Roles `hunch-dev-predictions`, `hunch-dev-resolver`, `hunch-dev-recovery`, `hunch-dev-resolution`, `hunch-dev-history`, and `hunch-dev-offers`. `hunch-dev-history` can `GetItem` and `Query` the table. It cannot scan or write. `hunch-dev-offers` can `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems`, and can start a resolution execution. The resolver can also `PutItem`, because the win transaction puts the offer. These functions and roles are in the packaged template. They are in the account only after the next deploy. The deploy param `doubleDown` defaults to `off`. Pass `--param doubleDown=on` to turn that feature on. The deploy param `redemption` defaults to `off`. Pass `--param redemption=on` to turn Redemption on. The two params are independent. Turning Redemption off does not change Double Down or standard scoring.
- Topic `hunch-dev-alerts`. Email subscription only when deploy passes `--param alarmEmail=...`. Confirm that email or the alarms have no subscriber.
- Alarms, all to that topic, period 300 seconds, threshold 1, missing data does not breach: `hunch-dev-resolution-failed`, `hunch-dev-resolution-timed-out`, `hunch-dev-resolver-errors`, `hunch-dev-recovery-errors`, `hunch-dev-workflow-start-failed`.

`hunch-dev-resolution-failed` means an execution reached the Fail state, which is an unexpected resolver status. `hunch-dev-resolution-timed-out` means an execution ran for 6 hours. The resolver and recovery alarms mean that Lambda reported Errors. `hunch-dev-workflow-start-failed` means the create-prediction log contained `prediction.workflow_start_failed`. The round was still saved. The scanner starts it if no execution is running. A provider hold does not fail the execution and does not raise these alarms.

`yarn serverless remove` from `apps/api` deletes the stack and keeps the table. The table's deletion policy is Retain.

Investigation:
1. Identify the prediction ID from the player item or the receipt.
2. Read the player item and `PREDICTION#<id>`. A settled player has no `activePredictionId`. A pending item still has `pendingKey`.
3. In Step Functions, open `prediction-<id>`. A recovered failure is `prediction-<id>-r<epochMinutes>`. `aws stepfunctions describe-execution --execution-arn <arn>` shows the status. `aws stepfunctions get-execution-history --execution-arn <arn>` shows the steps.
4. In Logs Insights, on the create, resolver, and recovery log groups:

```
fields @timestamp, event, predictionId, playerId, state, action, executionName
| filter predictionId = "p_..."
| sort @timestamp asc
```

Logs do not contain the access token or its hash. `prediction.created` includes `executionName`, `priorRounds`, and `repeat`. `history.listed` includes `count` and `hasMore`. A day of repeat play can be counted with:

```
fields @timestamp, playerId, priorRounds, repeat
| filter event = "prediction.created"
| stats count() by repeat
```

That count is not proof that players were retained or activated. Offer lines are `offer.created`, `offer.accepted`, `offer.declined`, `offer.extended`, `offer.replaced`, and `offer.rejected`. Acceptance and completion can be counted from those lines. They are not proof of retention or activation.

```
fields @timestamp, event, offerId, predictionId
| filter event like /^offer\./
| stats count() by event
```
5. To stop a live execution: `aws stepfunctions stop-execution --execution-arn <arn>`. Stopping it does not score the round. After `dueAt` plus about 7 minutes the scanner starts one replacement execution.
6. Starting `prediction-<id>` again after it succeeded returns the existing execution and does not score again. For an execution that already failed, timed out, or was aborted, `aws stepfunctions redrive-execution --execution-arn <arn>` reruns it from the failed step. That is the operator alternative to waiting for the scanner. A round whose execution was never started has nothing to redrive. The scanner starts that one.
7. Confirm one `RESOLVED` prediction and one score change. There is no in-app cancel. To unlock a player by hand, delete the `PREDICTION#` item and remove `activePredictionId`. Do not do that for a round the workflow may still settle.

Security:
- Keep credentials out of Git.
- Redact tokens in logs.
- Restrict IAM to required resources.
- Configure CORS for intended origins. A missing origin makes the hosted shell show **Backend unreachable.** even when `curl` of `/health` returns `{"status":"ok"}`.
- Treat CORS as browser policy, not authentication.
- This dev account cannot enable root MFA without a permanent upgrade. See D6.

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
`prediction-{predictionId}`. `ExecutionAlreadyExists` is treated as success.
A separate recoverStuckPredictions Lambda runs every five minutes. It queries
the `pending-by-due` index for pending predictions whose `dueAt` is more than
two minutes past. A missing execution uses the base name. A running or
succeeded execution is skipped. A failed, timed-out, or aborted execution is
restarted as `prediction-{predictionId}-r{epochMinutes}`.

**Correction, recorded with T08.**
The earlier wording said the same execution name can always be started again.
That is true only while the execution is still running, or for the
`ExecutionAlreadyExists` response on a second start of a live name. After the
execution finishes, Step Functions keeps that name for 90 days and rejects a
restart. The scanner therefore uses a new name for a finished failure. The
settlement transaction, not the execution name, is what prevents a second
score change.

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
A prediction whose workflow never starts is not recovered until it is more
than two minutes past `dueAt` and the next scanner run sees it. That is
about 7 minutes after `dueAt` in the worst case, and under 5 minutes after
the round becomes eligible. During that window the UI keeps the round active.
The scanner and the workflow are alarmed. An execution that is still running
at 6 hours times out, the alarm fires, and the next scanner starts a new
named execution. This is an operationally acceptable tradeoff at MVP scale.

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

---

### D6 — Dev account: deploy in eu-north-1 and skip root MFA

**Decision.**
The dev AWS account is a new project account, created with Sign up for AWS (new). The active project is ePilot - Hunch. Europe accounts on that signup are locked to Europe (Stockholm), `eu-north-1`. Deploy the dev stage there. Do not activate advanced features, and do not enable root MFA on this account.

**Reason.**
The root security-credentials page only appears after activating advanced features. That activation is permanent, requires a paid upgrade, and removes the account spend limit. Lambda, API Gateway, DynamoDB, Step Functions and Amplify are already included, so the game does not need that upgrade. Reviewers and players use the public Amplify URL and the public API Gateway URL. They do not sign in to this AWS account, so the missing MFA does not affect them.

**Alternatives considered.**
- Activate advanced features and deploy in `eu-west-1` with root MFA: unlocks the region picker and the MFA page, at the cost of a permanent account change and no spend limit.
- Keep the documented `eu-west-1` default and deploy there anyway: this account rejects regional resources outside Stockholm.

**Tradeoff or limitation.**
The dev stack cannot move to another region unless the account is permanently upgraded. The CLI user `hunch-dev` has an access key and no console password. That key stays on Mario's Mac and out of Git. A reviewer who deploys their own copy on a classic AWS account can pass a different `--region`.

---

### D7 — Offer deadline is an ISO string, and expiry is derived

**Decision.**
Store the Double Down deadline as an ISO string in `expiresAt`. Do not write a status of `EXPIRED`. An offer is expired when its stored status is `OPEN` and `now` is at or after that string. `GET /me` returns the latest offer while it is open, and until 60 seconds after the deadline.

**Reason.**
The table TTL deletes any item whose `expiresAt` is a number. That attribute is the epoch-second lifetime of idempotency rows. An offer that used the same numeric name would disappear before the player could accept it. Deriving expiry on read means a late request and a refresh agree without a second write.

**Alternatives considered.**
- A different numeric attribute name with no TTL: works, but then two clocks exist and a writer must remember which field the TTL watches.
- A scheduled write that sets `EXPIRED`: adds a timer for a 10-second window and can race with accept.

**Tradeoff or limitation.**
String comparison is safe only because both values are `toISOString()`. The offer stays in the table after it ends. Idempotency rows still use a numeric `expiresAt` and are the only rows the TTL deletes.

---

### D8 — Redemption keeps +4/−2, and the name is a constant

**Decision.**
A Redemption win adds 4 and a loss subtracts 2. The parent −1 stays. The pair is therefore +3 or −3. The on-screen name is `REDEMPTION_NAME` in `apps/web/src/featureNames.ts`. It is `Redemption`. Changing that constant renames the mode everywhere. There is no name config.

**Reason.**
The ticket fixes the arithmetic. At roughly even odds, accepting is worth about +1: half the time +4 and half the time −2 averages +1, on top of the −1 already booked. Declining adds nothing, so it keeps −1. Declining is never the better score on that assumption. Changing the deltas to make decline attractive would be a different game. A constant keeps every screen on one word without a settings system.

**Alternatives considered.**
- Score the follow-on so that declining can be the better expected value: rejected. That changes the ticket.
- A remote or env name: rejected. One string does not need a config system.

**Tradeoff or limitation.**
A player who wants to stop does not improve the expected score by declining. The copy stays neutral and does not say the decline is a better bet. The hosted flag stays off until a deploy passes `--param redemption=on`.