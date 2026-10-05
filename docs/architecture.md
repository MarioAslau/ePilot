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
- createPrediction
- startPredictionWorkflow
- resolvePrediction
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
6. DynamoDB Stream triggers a workflow starter.
7. Starter begins a deterministically named Standard execution.
8. Workflow waits until dueAt.
9. Resolver retrieves a fresh quote after the deadline.
10. Equal price causes another wait.
11. Differing price causes an atomic settlement transaction.
12. Browser polling receives the confirmed result.

## Anonymous identity

Create a random player ID and high-entropy access token.
Store a token hash in the backend.
Store ID and raw token in browser localStorage.

A player ID identifies a record; the token authorises access.
The browser never owns the authoritative score.

Limitations:
- Clearing storage loses access.
- Different devices do not share identity.
- localStorage tokens are exposed if the app suffers an XSS flaw.
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

Define exact schemas in packages/contracts during T03.
Use a consistent error shape with code, message and request ID.

Proposed responses:
- 400: invalid input
- 401: invalid anonymous credentials
- 409: active prediction or conflicting idempotency payload
- 503: provider unavailable

## Proposed data model

Use one DynamoDB table with partition/sort keys designed around
actual access patterns. Finalise exact indexes during implementation.

Player:
- playerId
- accessTokenHash
- score
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

Prediction creation transaction:
- Require player has no active prediction.
- Create prediction.
- Set activePredictionId.
- Record request idempotency information.

Settlement transaction:
- Require prediction is unresolved.
- Require player's active ID matches the prediction.
- Store outcome and quote.
- Add score delta.
- Clear activePredictionId.

Transactions either apply all required changes or none.
Duplicate execution is possible; duplicate score effects must be prevented.

## Workflow startup and recovery

Use the DynamoDB Stream to bridge saved predictions to workflow startup.
This avoids relying on one HTTP handler completing both a database write
and a workflow-start call.

Handle duplicate delivery using deterministic execution names and input.
Configure failed-delivery handling.
Monitor workflow failures and preserve pending records for recovery.

This adds operational complexity.
Review it during Grill Me before implementing T08.

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