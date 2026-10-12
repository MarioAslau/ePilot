# Implementation Plan

## Goal

Deliver a deployed BTC/USD prediction game satisfying the epilot assignment.

Then add optional features that demonstrate product judgment.

## Current progress

- Active ticket: T14
- Status: In progress

T13 is complete. Mario marked the local Redemption check done on 2026-10-11. `FEATURE_REDEMPTION` is off unless a deploy passes `--param redemption=on`. `yarn dev:local` defaults Redemption on when that variable is unset, the same way it defaults Double Down on. History, Double Down, and Redemption are not on the hosted site until the next API deploy and Amplify rebuild. T12 stays complete: Mario marked the local Double Down check done on 2026-10-11, and that flag stays off unless a deploy passes `--param doubleDown=on`. T14 is in progress. The README is drafted. Deploy with both modes on, screenshots, and the hosted final manual test are still open. On 2026-10-11 Mario pressed Up on the hosted site, closed the tab, and reopened after 5 minutes. The round had settled as a loss. The fuller pass before submission remains the hosted list under T14.

## Working agreement

Follow `.cursor/rules/project-workflow.mdc`.

For every ticket:

1. Inspect relevant files.

2. Explain the approach.

3. Implement only that ticket.

4. Run relevant checks.

5. Provide manual testing steps.

6. Update the ticket and diary with actual results; set Awaiting manual verification.

7. Stop for Mario's verification. Mark Complete only after he confirms.

8. Commit after approval, then start the next ticket.

Status values:

- Not started

- In progress

- Awaiting manual verification

- Complete

- Blocked

Do not treat generated code or passing unit tests as proof that

the deployed user journey works.

## Design integration and current evidence

This revision incorporates the supplied Hunch HTML prototype and two desktop screenshots. It preserves the uploaded plan's recorded status: T00 In progress, later tickets Not started. No repository, installed skills, test runs or deployment were inspected. If those have progressed, reconcile their statuses with actual evidence before beginning work; do not repeat completed installation work.

The architecture file was not supplied. Before code changes, copy the approved UI specification below into its existing UI section and reconcile contracts with its current contents. This plan does not replace the architecture document.

The uploaded Markdown had escaped headings and bullets. This revision restores normal Markdown formatting.

### Design references added to the repository during T01

- `docs/design/hunch-prototype.html`: the supplied HTML, renamed to this stable path. ✅
- `docs/design/desktop-ready.png`: screenshot 19.08.48, ready state. ✅
- `docs/design/desktop-rules-open.png`: screenshot 19.08.51, rules expanded. ✅
- `docs/design/desktop-active.png`: screenshot 19.08.55, active prediction with countdown. ✅

`docs/design/` contains reference assets, not another maintained planning document. Preserve the prototype as a design reference. Implement the product in React/TypeScript rather than shipping its in-page simulated server. No mobile screenshot was supplied; confirm the responsive layout in T01/T02. Double Down and Redemption are not implemented in the supplied prototype; design their offers before T12/T13.

### UI specification for architecture.md

- Working product name: Hunch. Original dark trading-inspired style with charcoal background, raised cards, yellow brand/focus accents, green Up and red Down. Direction and outcome must also have text/icons.
- Prototype tokens: background `#121418`, surface `#1A1D23`, raised `#22262D`, borders `#2C3139`, text `#ECEEF1`, muted `#A3ABB7`, yellow `#F2C14E`, green `#26C281`, red `#F2555F`. Use these as reference; verify contrast in the actual controls.
- Archivo typography with system fallback, tabular prices/scores/timers, 4px spacing scale, approximately 14px card and 10px control radii. Reuse tokens rather than arbitrary styling per component.
- Desktop: header with Hunch and short anonymous identity; primary left card with market then prediction panel; right column with score, history and expandable rules. Prototype uses a 1120px content width and two columns from 960px.
- Mobile: one column, accessible score in the header, market and prediction controls before history/rules, readable buttons and no horizontal overflow. Keep current score visible during play without depending on the desktop sidebar.
- Candidate components: AppHeader, MarketCard, PriceStatus, PriceChart, PredictionPanel, DirectionButtons, RoundTicket, ResultReceipt, ScoreCard, RoundHistory, HowItWorks and StatusNotice. These are responsibilities, not a requirement to create one file for every label.
- Ready: latest available price, source/update age, score, Up/Down and concise rules. Negative scores are valid.
- Submission: lock both buttons immediately, show Recording entry, then render the server-confirmed direction, price and timestamps. Do not treat the displayed click price as the accepted quote.
- Active: entry/latest price, minimum-wait countdown and Placed → Waiting → Comparing → Result tracker. Any current movement is explicitly not final.
- After countdown: Checking price until the backend confirms settlement. Show equal-price or provider-outage explanations only when backend state reports that reason; a stale display feed alone does not establish the resolver's status.
- Results: Correct/Not this time, score delta, entry/compared quote, accepted/settled times and elapsed duration. Make standard play available again from backend-confirmed state. Show a result once per prediction, including restoration after return.
- Recovery: player setup/restoration errors with retry; submission outcome unknown requires reconciliation, not a claim that nothing was recorded; stale market keeps last known value; player-state failure marks the score/state as last confirmed and conservatively locks new submissions until reconciled.
- Score copy must say: “Your score is saved on our server. This browser remembers your anonymous player.” The prototype's “Saved to this browser” implies the wrong ownership. Explain that clearing credentials or changing devices loses anonymous access.
- Polling status should say Latest available or Updated X seconds ago with Coinbase as source. Do not imply a streaming feed. Poll intervals are configuration, not dictated by the prototype: start around 5s for market and 2s for active player state; refresh on return and after mutations; tune from observed cost/latency. No WebSockets required.
- Accessibility: native controls, visible keyboard focus, meaningful names, touch targets around 44px or larger, logical focus after a panel changes, restrained motion and reduced-motion support. Announce significant state transitions once, not every price tick/countdown second. Chart has a text alternative.
- Basic How it works is MVP functionality, not deferred to T11. Persisted paginated history is T11 and is complete locally. The earlier placeholder must not be used to tell an existing player they have no rounds.

### Prototype behaviour that must not leak into production

The HTML uses a seeded random price walk, an in-page mock server, fake in-memory credentials, fixed RPC delays and simulated tab closure. It does not prove backend persistence, actual browser-close resolution or AWS correctness. It only implements standard +1/-1 rounds.

- Keep scenario controls, time skips and seeded outcomes in local test fixtures only. Production timing remains at least 60 seconds.
- Do not copy its integer-cent precision assumption: exact provider prices and decimal-safe comparisons remain authoritative. If rounded quotes look equal but the exact result differs, provide additional precision in the receipt.
- Do not copy full player history into every `/me` response. Return active prediction and an identifiable latest result. Paginate settled history on `GET /predictions`. T11 is complete locally. Define the `/me` response in T03 so T09 can restore results without implementing the history feature early.
- The chart's synthetic two-minute history and 1m change must be replaced with real observations. In T06 collect validated display samples in memory while this browser is open. Start with an empty chart and “Collecting recent prices”; use actual sample coverage. Do not invent earlier points, a full two-minute window or a 1m change until sufficient data exists. This chart is informational and never resolves a round.

### Visible delivery and testing sequence

| Ticket | What Mario can see and test |
| --- | --- |
| T01 | Approve ready, waiting, checking, equal, outage and result designs; review rules and mobile layout. |
| T02 | Responsive Hunch layout and local fixture-driven states, clearly marked as preview. No real game claimed. |
| T03 | Fixture UI uses shared contract shapes; deterministic domain tests explain time/equality/precision. |
| T04 | Hosted shell calls the real health API. |
| T05 | Real anonymous identity/score restores across refresh and browser reopening. |
| T06 | Real BTC price, source/age, observed chart and stale/error states. |
| T07 | Real submission and locked round ticket/countdown. Settlement is not available until T08; use an isolated dev player and documented cleanup for testing. |
| T08 | Whole core loop works through the UI against AWS, including result and browser-close recovery. |
| T09 | Complete exceptional states, focus, responsive polish and repeat-play/restoration behaviour. |
| T10 | Verified deployed MVP; extras begin only after this gate. |
| T11 | Real history. Complete locally on 2026-10-11. Not on the hosted site until the next deploy. |
| T12 | Momentum Double Down. Complete locally on 2026-10-11. Off on a deploy unless `--param doubleDown=on`. Not on the hosted site until the next deploy. |
| T13 | Redemption. Complete locally on 2026-10-11. Off on a deploy unless `--param redemption=on`. Not on the hosted site until the next deploy. |

A local fixture view helps test presentation without waiting for markets. It is not proof of backend fairness. Each backend ticket gets API/integration checks and its relevant browser checkpoint.

## Ticket overview

- [x] T00 — Establish project documentation
- [x] T01 — Verify skills, clarify architecture and approve UI
- [x] T02 — Scaffold TypeScript projects and testable UI
- [x] T03 — Define contracts and test game rules

- [x] T04 — Deploy a minimal AWS slice

- [x] T05 — Create and restore anonymous players

- [x] T06 — Display validated BTC prices

- [x] T07 — Create predictions safely

- [x] T08 — Implement durable resolution and playable core loop

- [x] T09 — Complete frontend states and interaction polish

- [x] T10 — Verify and freeze the MVP

- [x] T11 — Add persisted history and progression

- [x] T12 — Add Momentum Double Down

- [x] T13 — Add Redemption Round

- [ ] T14 — Release and prepare the walkthrough

## T00 — Establish project documentation

Status: Complete

Dependencies: Existing Git repository.

Tasks:

- Create .cursor/rules/project-workflow.mdc.

- Create docs/implementation-plan.md.

- Create docs/architecture.md.

- Create README.md.

- Check consistency between the documents.

- Mark proposed decisions and unimplemented features honestly.

Acceptance:

- All four documents exist.

- Paths and technology choices agree.

- No invented deployment URLs or passing checks.

- Mario understands the purpose of each document.

Manual checkpoint:

Read the documents and identify any unclear decisions.

Suggested commit:

docs: establish project workflow and implementation plan

## T01 — Verify skills, clarify architecture and approve UI

Status: Complete

Dependencies: T00.

Sources:

- Grill Me: https://www.aihero.dev/skills-grill-me

- Ponytail: https://github.com/DietrichGebert/ponytail

Tasks:

- Read current installation instructions.

- Install project-scoped Cursor-compatible skills.

- Inspect installer changes.

- Preserve required references, attribution and licences.

- Verify each skill is discoverable and can be explicitly invoked.

- ✅ Skills installed: `.cursor/skills/grill-me/SKILL.md` and `.cursor/skills/ponytail/SKILL.md`. Full Ponytail source at `vendor/ponytail/`. Hooks in `.cursor/hooks.json`.
- ✅ Hook limitation documented in README: absolute machine-specific paths require re-running the installation script on each new machine.
- ✅ Grill Me verified: explicitly invoked this session via `/grill-me`; `disable-model-invocation: true` confirmed.
- ✅ Ponytail verified: hook activated at session start (PONYTAIL MODE ACTIVE confirmed).

- Run a bounded Grill Me review of the MVP.

- Record agreed decisions in architecture and plan documents after confirmation.
- Add the supplied reference files to `docs/design/` under the paths above.
- Review the prototype's built-in state gallery and responsive styles. Approve UI behaviours, not just the ready screenshot.
- Resolve prototype/production differences using this plan's design integration section.
- Put the approved UI specification in docs/architecture.md and reference it from affected tickets.
- Keep the review bounded. Normal ticket planning follows; Grill Me is not mandatory on every ticket.

Grill Me prompt:

Use the installed Grill Me skill.

Read the project rule, implementation plan and architecture.

Ask one question at a time.

Prioritise fairness, identity, concurrency, workflow startup,

provider failure and deployment.

Keep the review focused on the MVP and approximately 15 minutes.

Do not code or add features.

Summarise agreed decisions without editing files during the discussion.
After Mario confirms, apply the summary to the architecture decision log and affected tickets in a separate step.

Acceptance:

- Both skills have been verified.

- Integration limitations are documented.

- Important MVP ambiguities are resolved or explicitly recorded.
- MVP UI states and responsive layout are agreed; optional mode designs remain explicitly pending.

Manual checkpoint:

Confirm the agent identifies the actual skill file it used. Review the ready and round-state designs, score persistence wording, error recovery and mobile stacking.

Suggested commit:

chore: add verified Cursor skills and planning decisions

## T02 — Scaffold TypeScript projects and testable UI

Status: Complete
Dependencies: T01.

Tasks:
- [x] Confirm a supported Node.js LTS version (using Node 20.20 / Yarn 1.22.22).
- [x] Use Yarn workspaces and commit the lockfile.
- [x] Create apps/web with React, TypeScript and Vite.
- [x] Create apps/api for TypeScript Lambda application code.
- [x] Create packages/contracts for shared types and Zod schemas.
- [x] Add Tailwind v4, Lucide and TanStack Query to the frontend.
- [x] Configure strict TypeScript, linting and Vitest.
- [x] Add root scripts for dev, build, typecheck, lint, test and check.
- [x] Add .gitignore and .env.example.
- [x] Build the Hunch visual foundation from the approved references: tokens, header, market area, score, prediction panel and rules accordion.
- [x] Create a local-only fixture preview for all 9 states. Reuses production components; excluded from production build via dynamic import.
- [x] Basic rules explanation included in HowItWorks accordion.
- [x] Pin Serverless Framework (^4) with serverless-esbuild.

Acceptance:
- [x] Dependencies install successfully (`yarn install`).
- [x] Typecheck passes (`yarn workspace web typecheck`).
- [x] Lint passes (`yarn lint`).
- [x] Tests pass — 5/5 (`yarn workspace web test`).
- [x] Production build succeeds (`yarn workspace web build`).
- [x] Local frontend opens and fixture states can be reviewed (`yarn dev`).
- [x] Layout works at 375px and desktop widths with visible score, readable controls and keyboard focus.
- [x] No game functionality is claimed yet.

Manual checkpoint:

Run the documented commands from the repository root. Open every fixture state, inspect desktop and 375px widths, keyboard-navigate the controls and rules accordion. Confirm preview values are labelled.

Suggested commit:

chore: scaffold TypeScript frontend and serverless backend

## T03 — Define contracts and test game rules

Status: Complete

Dependencies: T02.

Tasks:

- [x] Define UP/DOWN and prediction lifecycle types.

- [x] Define server timestamps and price metadata.
- [x] Include `resolutionTradeTime` (exchange trade timestamp from Coinbase ticker `time` field) in the Prediction type and resolution response. This is distinct from the Lambda fetch time and proves the compared price is post-deadline. See D1 in architecture.md decision log.

- [x] Choose decimal-safe prices with strings at storage/API boundaries.

- [x] Implement a pure evaluator with an injected clock.

- [x] Define proposed API requests, responses and errors.
- [x] Include `/me` activePrediction, latest resolved prediction and server time; identify the result by prediction ID so it can restore and avoid duplicate feedback.
- [x] Define backend wait reasons, quote freshness and recoverable errors needed by the UI. Do not infer provider/equal-price resolution status from the display quote.
- [x] Connect local fixture shapes to these contracts and define indeterminate submission recovery.

- [x] Define anonymous token and idempotency-key handling.

- [x] Document contracts in docs/architecture.md.

Tests:

- [x] UP and DOWN wins/losses.

- [x] Before 60 seconds: no settlement.

- [x] At the deadline: eligible for evaluation.

- [x] Equal price: retry.

- [x] Display rounding cannot determine the outcome.

- [x] Standard score delta is exactly +1 or -1.

Acceptance:

- [x] Domain rules pass deterministic tests.

- [x] Contracts are documented.

- [x] Manual checkpoint: explain which price is compared and why early movements do not settle.

Manual checkpoint:

Explain which price is compared and why early movements do not settle.

Suggested commit:

feat: define prediction contracts and tested scoring rules

## T04 — Deploy a minimal AWS slice

Status: Complete

Dependencies: T03.

Manual preparation:

- Configure AWS CLI access without root access keys.

- Confirm the account using aws sts get-caller-identity.

- Selected region: `eu-north-1` (Europe, Stockholm), stage `dev`. This project account cannot create resources in `eu-west-1`. See D6 in architecture.md.

- Skip root MFA. The MFA page requires activating advanced features, which is permanent. See D6.

- Enable billing alerts.

- Complete Serverless Framework authentication if required.

- Confirm GitHub access and Coinbase public API connectivity.

Tasks:

- Define health Lambda and API Gateway HTTP API.

- Define an on-demand DynamoDB table. DynamoDB Streams are not required (see D2 in architecture.md); do not enable them.

- Configure IAM, timeouts, resource tags and log retention.

- Package and inspect infrastructure before deployment.

- Deploy the dev backend.

- Connect Amplify Hosting to the GitHub repository.

- Configure apps/web build settings and SPA fallback.

- Set public VITE_API_BASE_URL.

- Configure allowed frontend origins and CORS.

- Test frontend-to-backend connectivity from the Hunch shell.
- Production shell must show connection/setup availability honestly; do not ship fixture prices or a selectable fake game as the deployed solution.

Acceptance:

- Public frontend and health endpoint work.

- Actual deployment steps are documented.

Manual checkpoint:

Open the hosted app and verify a successful backend request.

Suggested commit:

feat: deploy initial AWS API and hosted frontend

## T05 — Create and restore anonymous players

Status: Complete

Dependencies: T04.

Tasks:

- POST /players creates a player ID and generates an access token with `crypto.randomBytes(32).toString('hex')`. Return the raw token to the browser once; never store it on the server. Store the SHA-256 hash of the token on the Player record in DynamoDB. Initialise score, wins and losses at 0. See D3 in architecture.md decision log.

- Store player ID and raw token in browser localStorage.

- GET /me authenticates and returns score and active prediction.

- Restore identity on startup.
- Wire the header identity and score to `/me`; add initial loading, restoration retry and storage-unavailable messaging. Hide/disable guess controls until player setup completes.

- Do not reset identity on a temporary network failure.

- Document storage-clearing and cross-device limitations.

Tests:

- Initial score 0.

- Existing player restores.

- Invalid token rejected (hash mismatch returns 401).
- Token verification uses `crypto.timingSafeEqual` to prevent timing attacks.

- Network errors do not create replacement players.

Manual checkpoint:

Refresh, close and reopen the browser.

Confirm the same player is restored.

Confirm incognito creates another player. Simulate a restoration network failure and verify it retains credentials and offers retry. Check the score copy describes server persistence.

Suggested commit:

feat: persist anonymous player identity and score

## T06 — Display validated BTC prices

Status: Complete

Dependencies: T05.

Tasks:

- Implement Coinbase adapter with timeout and response validation.

- Implement GET /market.

- Return price, source and timestamps.

- Poll display price using TanStack Query; start with a configurable approximately 5s interval.
- Wire MarketCard source, age and Latest available/Delayed/Unavailable states. Keep Up/Down unavailable when there is no trustworthy current display context; backend entry validation remains authoritative.
- Build the informational chart from validated observations gathered since page load. Label actual coverage and withhold 1m change until it has a valid baseline. Reuse a simple SVG implementation if sufficient; no chart service is required.

- Preserve last available price with an honest stale/error indicator.

- Keep display caching separate from fresh settlement quotes.

- Reject new predictions if a valid entry quote cannot be fetched. Deferred to T07. T06 supplies the uncached `fetchTicker` and `ProviderUnavailableError` that the prediction handler will call. There is no `POST /predictions` yet, so this task is not done.

Tests:

- Valid response.

- Malformed response.

- Timeout and rate limit.

- Loading and stale UI states.

Manual checkpoint:

Confirm price/source/update age and sample-built chart. Simulate a failed request: retain the last known value, mark it stale, and show retry/recovery. Refresh and confirm the chart starts collecting again rather than fabricating history.

Suggested commit:

feat: display validated BTC market prices

## T07 — Create predictions safely

Status: Complete

Dependencies: T06.

Tasks:

- Authenticate and validate direction and idempotency key. The browser generates the key with `crypto.randomUUID()` before submission and reuses it on retry. See D4 in architecture.md decision log.

- Check the Idempotency record: if `(playerId, idempotencyKey)` already exists, return the stored prediction immediately. If the key exists with a different direction, return `409 IDEMPOTENCY_CONFLICT`.

- Fetch entry quote on the backend.

- Record server createdAt and dueAt.

- Transactionally create prediction and lock player. Transaction conditions: player has no `activePredictionId`; writes Prediction, updates Player, writes Idempotency record atomically. If condition fails return `409 ACTIVE_ROUND`.

- Return the original prediction for a duplicate request.

- Implement Up/Down submission, immediately locked controls and a server-confirmed round ticket.
- Show accepted quote/time, direction and a minimum-wait countdown from server timestamps. At zero show Checking price; do not invent a result.
- Keep an outcome-unknown submission locked while reconciling `/me` or retrying with the same idempotency key. Only claim “not placed” after a definitive server rejection.

- Reconcile state after response timeout.

Tests:

- Concurrent submissions create one active prediction.

- Duplicate request returns original result.

- Lost response can be retried safely.

- Client price/time/score cannot control the round.

Manual checkpoint:

Double-click and submit from two tabs.

Confirm only one active prediction exists. Inspect the accepted entry and countdown; simulate a lost response and reconcile the same round.

Mario confirmed this on 2026-10-11. A second tab shows the first tab's round immediately, so a hand-timed second click cannot land. The overlapping two-request case is the API test: one response is 201 and the other is 409.

T07 limitation: durable settlement is implemented in T08. Use an isolated dev player for this checkpoint and an explicit dev-only cleanup procedure if necessary; do not expose a production reset/cancel action.

Suggested commit:

feat: create predictions with concurrency and retry protection

## T08 — Implement durable resolution and playable core loop

Status: Complete

Dependencies: T07.

Tasks:

- In createPrediction: after the DynamoDB transaction succeeds, call sfn:StartExecution with execution name `prediction-{predictionId}`. This call is idempotent on a given name. Grant the Lambda sfn:StartExecution on the workflow ARN only.

- Define Step Functions Standard workflow.

- Wait until server dueAt.

- Invoke resolver and reload prediction state.

- Verify deadline before evaluating.

- Fetch a fresh valid price.

- Equal price: wait and retry.

- Provider failure: retry/backoff without scoring.

- Differing price: transactionally settle, update score, increment wins or losses, and clear lock.

- Condition settlement on unresolved status and matching active ID.

- Return stored result for duplicate settlement.

- Store resolution quote and timestamps, including `resolutionTradeTime` from the Coinbase ticker `time` field (D1). Show the trade timestamp on the result receipt alongside the fetch timestamp so the player can verify the 60-second rule was satisfied.

- Implement recoverStuckPredictions Lambda on a five-minute CloudWatch schedule. Query the `pending-by-due` index for pending predictions whose `dueAt` is more than two minutes past. A missing execution starts as `prediction-{predictionId}`. A failed, timed-out, or aborted execution restarts as `prediction-{predictionId}-r{epochMinutes}`, because Step Functions keeps a finished name for 90 days. A running or succeeded execution is skipped. The scanner never writes a score. Alert on scanner and workflow failure (D2).
- Connect active-state polling and the minimum result receipt now, so this ticket produces a playable real core loop. Do not defer all result UI until T09.
- Return the latest persisted result through `/me` for browser-return display; add the basic score update and repeat-play transition.

Tests:

- No early settlement.

- Equal-price retry.

- Provider failure.

- StartExecution called twice with the same name does not create a duplicate execution.

- Recovery scanner detects a stuck prediction and starts its execution.

- Duplicate settlement.

- Transaction failure leaves consistent state.

- Recovery does not double-score.

Manual checkpoint:

Submit and close the browser.

Reopen after the deadline and inspect the confirmed result receipt and score in the UI as well as backend state. Complete one deployed round with the real 60-second minimum. Use deterministic adapter fixtures/integration tests for equal/outage cases; do not wait for chance market outcomes.

Acceptance:

- Browser-independent resolution works and the basic end-to-end UI loop is playable.

- Score effect occurs once despite retries.

- recoverStuckPredictions scanner is deployed and tested; stuck prediction auto-recovers within five minutes.

- Startup and workflow failures have a documented recovery path.

Suggested commit:

feat: resolve predictions durably and update scores atomically

## T09 — Complete frontend states and interaction polish

Status: Complete

Dependencies: T08.

Tasks:

- Finalise player-state polling while active (initially approximately 2s), refetch on focus/return and refresh after mutations; avoid overlapping requests.

- Invalidate cached state after mutations.

- Show server-deadline countdown with clock-offset consideration.

- At zero show Checking price.

- Explain equal-price pending state from the backend reason.
- Add provider hold, stale player state, setup/restoration retry and indeterminate submission presentation. Never present an outage as a loss.

- Show outcome, entry/exit prices and score delta.

- Restore active/result state after refresh.

- Re-enable actions from confirmed backend state.

- Prevent duplicate result animations.

- Support mobile, keyboard focus and reduced motion.
- Finish the Hunch step tracker, timer ring, result receipt and source/freshness copy. Label temporary market movement as not final.
- Test focus when buttons are replaced by a round ticket; announce transitions once, never every timer tick.
- If rounded receipt values hide the winning difference, show enough precision to explain the actual comparison.
- Render ScoreCard with numeric score for new players; after the first settled round also show accuracy percentage and wins/losses counts from the `/me` response (MVP, not deferred to T11). Statistics must accurately reflect only settled rounds.
- Check that history placeholders are honest before T11.

Tests:

- Active round disables new guesses.

- Timer zero does not invent a result.

- Restored active and latest result states render; refresh never resets a player.
- Stale player-state errors retain last confirmed score and conservatively block submission.
- Unknown submission outcome does not claim failure or open a second round.

- Win/loss and errors render correctly.

Manual checkpoint:

Use controlled fixtures for both outcomes.

Complete one actual deployed 60-second round.

Test mobile width and keyboard interaction.

Suggested commit:

feat: complete prediction countdown and result experience

## T10 — Verify and freeze the MVP

Status: Complete

Dependencies: T09.

Tasks:

- Run domain, adapter, handler and component tests.

- Test actual DynamoDB concurrency conditions using an isolated

  test table or suitable emulator.

- Add one deterministic Playwright critical journey using a controlled API fixture: create/restore player → choose direction → locked wait → checking → confirmed result/score → play again. Simulated time only in tests.
- Include focused component tests for setup failure, stale market, equal/outage hold and result restoration; exercise actual DynamoDB conditions separately.
- Inspect deployed layout at mobile/desktop, keyboard navigation, reduced motion, fresh/stale copy and chart empty state. Automated fixture checks do not replace an actual AWS/browser-close smoke test.

- Manually verify deployed production timing.

- Add GitHub Actions for checks and build.

- Verify structured lifecycle logs introduced alongside T05–T08; fill any gaps without tokens. Correlate request, player, prediction and execution IDs. Observability means being able to explain where a round got stuck, not adding a user-facing analytics dashboard.

- Add actionable workflow/starter failure alarms.

- Verify alarm delivery.

- Document investigation and replay/redrive procedures.

- Run a focused Ponytail simplification review.

- Apply agreed changes and rerun affected checks.

- Update README with real commands and deployed URL.

- Tag the verified MVP.

Ponytail prompt:

Use the installed Ponytail skill on the changed MVP files.

Identify unnecessary abstraction, duplication and complexity.

Preserve behaviour, contracts and correctness safeguards.

Explain proposed changes before editing.

After approved changes, rerun relevant checks.

MVP gate:

- [x] New player starts at 0.

- [x] Browser reopening restores player and score.

- [x] Latest available price and score are visible.

- [x] Up/Down works.

- [x] Only one prediction can be active.

- [x] Backend owns price and time.

- [x] No settlement before 60 seconds.

- [x] Equal price remains pending.

- [x] Correct +1/-1 settlement.

- [x] Duplicate calls cannot score twice.

- [x] Closing browser does not cancel resolution.

- [x] Critical automated tests pass.

- [x] Deployed smoke test passes.

- [x] Public repository, deployed link and README exist.
- [ ] Responsive playable UI includes loading/recovery and fair pending states.
- [x] Basic rules/source/persistence explanations are available.
- [x] No simulated prices, speed controls or fake persistence are exposed as production functionality.

Suggested commit:

test: verify MVP lifecycle and operational recovery

## T11 — Persisted history and progression

Status: Complete

Dependencies: MVP gate passed.

Tasks:

- Add authenticated, paginated GET /predictions.

- Query the player's records without full-table scans.

- Replace the history placeholder with real empty/loading/error/populated states.
- Show direction, prices, outcome, timestamps and score delta, with accessible compact cards on mobile and a readable desktop list.
- Test pagination, private ownership and a player with negative score.

- Extend the MVP How it works panel with history/receipt details; do not duplicate or delay the basic game rules.

- Add clearly scoped statistics if time permits.

- Record minimal events for creation, settlement and repeat play.

- Do not claim retention or activation without appropriate data.

Value hypothesis:

Transparent results improve trust.

History and progression encourage repeat play.

These benefits must be measured, not claimed as proven revenue.

Tests/checkpoint:

History belongs to the player and matches persisted results.

Refresh preserves it.

Statistics describe their data scope.

Suggested commit:

feat: add prediction history and transparent progress

## T12 — Momentum Double Down

Status: Complete

Dependencies: T11 and reliable resolution. T11 is complete locally.

Proposed rules:

- Offer after a standard win.

- Server-created offer expires after 10 seconds.

- Same direction, fresh entry price and another minimum 60 seconds.

- Previous +1 remains settled.

- Bonus win adds 2; bonus loss subtracts 2.

- Combined pair is therefore +3 or -1.

- One acceptance per offer; no bonus chains.

Tasks:

- First approve a Double Down offer design using the existing Hunch components. Show the original +1, bonus +2/-2 and combined +3/-1 before opt-in; include decline/expiry/submitting/active/result/restored states.
- Ensure standard play remains easy; choosing a new standard round invalidates or rejects the old offer consistently on the backend.
- Add offer, parent prediction and mode fields.

- Implement authenticated, conditional offer acceptance.

- Enforce expiry and one active prediction.

- Reuse durable resolution with explicit mode scoring.

- Show exact scoring before acceptance.

- Add independent backend feature flag and UI visibility.

Tests:

Eligibility, expiry, concurrent acceptance, retries, restoration,

score arithmetic and no chaining.

Manual checkpoint:

Explain combined scores and inspect linked history.

Business hypothesis:

Optional continuation may increase repeat play.

Measure acceptance and completion.

Suggested commit:

feat: add optional momentum double-down rounds

## T13 — Redemption Round

Status: Complete

Dependencies: T11; shared offer primitives can follow T12.

Proposed rules:

- Offer after a standard loss.

- Original -1 settles immediately.

- Offer expires after 10 seconds.

- Player chooses direction for a fresh 60-second round.

- Combined target outcome is +3 or -3.

- Redemption win therefore adds 4.

- Redemption loss therefore subtracts 2.

- Decline/expiry leaves original -1 unchanged.

- No chains.

Tasks:

- First approve a Redemption offer design. Show original -1, bonus +4/-2, combined +3/-3 and decline/expiry retaining -1. Avoid “double or nothing”, which describes different arithmetic.
- Include explicit direction selection, neutral opt-in/decline, expiry, submission, active, result and restored states; keep standard play available.
- Reuse conditional, single-use offer acceptance.

- Add explicit redemption scoring and linked history.

- Show bonus delta and combined outcome before acceptance.

- Use a separate feature flag.

- Make decline clear and avoid pressuring language.

Tests:

Eligibility, expiry, decline, concurrency, retries, restoration

and combined score arithmetic.

Manual checkpoint:

Confirm original standard scoring remains unchanged.

Business hypothesis:

May encourage voluntary replay, but confusing scoring or

loss-chasing pressure could reduce trust.

No real money.

Suggested commit:

feat: add optional redemption rounds

## T14 — Release and walkthrough

Status: In progress

Dependencies: All features selected for submission.

Tasks:

- Run relevant checks after final changes.
- Compare the real ready/active/pending/result UI against approved references and update screenshots from the deployed application. Document implemented differences rather than claiming pixel-identical rendering.

- Confirm production timing and feature flags.

- Test standard play with extras disabled and enabled.

- Finish README setup, tests, deployment, screenshots and limitations.

- Align architecture documentation with actual implementation.

- Review public files for secrets.

- Rehearse a 5–7 minute walkthrough.

- Explain AI assistance honestly.

- Submit public repository and deployed URL.

Walkthrough:

1. User problem and prioritisation.

2. Standard game demonstration.

3. Browser restoration and fairness.

4. History and optional modes.

5. Architecture and one important tradeoff.

6. Critical tests and recovery.

7. What to measure or improve next.

## Final manual test

Run this once before submission. Local steps use `yarn dev:local` and a new player at `http://localhost:5173`. Each real round takes the minute. The hosted steps come after the API deploy and the Amplify rebuild of `release`.

A normal round already covers settlement. The fault steps below are easy to miss. `equal-price` turns the ticket amber for about 5 seconds, then the next check uses a real price and the round settles as usual. `resolution-provider-down` holds for two failed quotes, about 15 seconds apart, then settles. If the curl does not hit the server the page is using, the round is normal. Send the curl, then place the round, and watch the ticket as the countdown hits 0.

VoiceOver is the Mac screen reader, Command-F5. It is an accessibility check, not part of the game. Skip it if you are not listening to the page.

Local:

1. Empty storage, then start. Score is 0. Refresh and reopen the tab. The same player returns. A private window gets a different player. Restart `yarn dev:local` and refresh. The saved player is rejected. Start a new player.
2. The price, Live, and Coinbase Exchange are shown. The chart draws on this page. Block `/market`. The price dims, the pill says Delayed, and Up and Down stay visible but disabled, with “Waiting for a live price”. Unblock it and they work again.
3. Choose Up. Both buttons lock, then the ticket shows the server entry price, a not-final latest price, and a countdown. Focus is on “Your prediction”. Refresh. The same ticket returns. The score stays 0. A second tab shows that same round. Its buttons are gone.
4. `curl -X POST http://localhost:5173/api/__dev/next-prediction -H 'Content-Type: application/json' -d '{"mode":"drop-response"}'`, then choose Down. The page says it is checking whether the prediction was recorded, then shows one ticket.
5. Arm `{"mode":"provider-down"}` with no round active. The page says the prediction was not placed. The buttons return. The score stays 0.
6. Wait out a normal round. At 0 the ticket says Comparing prices. The receipt says Correct or Not this time, with the point change, both prices, and both trade times. The header score and the score card change once. Accuracy appears after this first settled round. Up and Down return. The receipt stays until the next round.
7. Arm `{"mode":"equal-price"}`, then place a round. At 0 the ticket is amber and says the latest price equals the entry. The score does not change. About 5 seconds later it can settle.
8. Arm `{"mode":"resolution-provider-down"}`, then place a round. The ticket says the price source is unavailable and that an outage never counts as a loss. The score does not drop. It then settles.
9. Refresh on a receipt. The receipt remains and the score does not flash again. Close the tab during a round and reopen after about 70 seconds. An unseen result flashes once.
10. Block `/api/me` during a round. The score says Last confirmed, Retry is there, and Up and Down stay disabled. Unblock it and the page recovers.
11. Keyboard only: Tab to Up and press Enter. Focus is on the round heading. After settlement, focus is on the receipt.
12. Optional. Command-F5 starts VoiceOver. One round should speak the placement, “Minimum wait complete”, and the result with the new score. It should not speak every second. Command-F5 turns it off.
13. System Settings, Accessibility, Reduce motion. The ring and the score flash do not animate. The words still show the state.
14. At 375px width there is no horizontal scroll. The score is visible in the header.

`http://localhost:5173/?fixture=win` and `?fixture=loss` show both receipts without waiting. They are previews, not a played round.

Hosted checkpoint for T10. Run this once, after deploy from `apps/api` with `--param amplifyOrigin=https://release.d2yczmbttcpoe9.amplifyapp.com --param alarmEmail=<email>`, confirming the SNS email, and pushing the frontend to `release`. This is the deployed smoke test. It is not a second procedure.

15. Before that deploy, `aws dynamodb scan --table-name hunch-dev --filter-expression "begins_with(sk,:p)" --expression-attribute-values '{":p":{"S":"PREDICTION#"}}' --select COUNT`. Expect 0. If it is not 0, delete that `PREDICTION#` item and remove `activePredictionId` first. Adding the index can take several minutes.
16. Place a round, close the browser, and reopen after more than 90 seconds. The receipt and the new score are there. The player item has no `activePredictionId`. The score changed once.
17. In Step Functions, `prediction-<id>` shows Wait, then Resolve, then Succeed, at or after `dueAt`. Starting that same name again does not score twice.
18. Stop that execution. After `dueAt` plus about 7 minutes, one `prediction-<id>-r…` execution settles the round once. No email is expected for a manual stop.
19. Place a second round with the same player.
20. `curl -X POST` of `<api>/__dev/next-prediction` and `<api>/api/__dev/next-prediction` returns 404. The hosted `/?fixture=win` is the normal app.
21. On the receipt from step 16, the compared trade time minus the entry trade time is at least 60 seconds.
22. Two parallel `curl` creates with different keys return one 201 and one 409.
23. `aws cloudwatch set-alarm-state --alarm-name hunch-dev-resolver-errors --state-value ALARM --state-reason "T10 delivery test"`. The email arrives. The alarm returns to OK on its next evaluation.
24. On the hosted URL, check 375px and desktop, the keyboard path, reduced motion, Live and Delayed, and “Collecting recent prices” on a fresh load.

Suggested commit:

docs: complete release handover and walkthrough

## Timing and scope

Plan for a verified MVP first.

Infrastructure, account access and integration failures can extend delivery.

Do not promise that all optional features fit into one day.

If time runs short:

- Preserve core correctness.

- Preserve backend persistence and browser-independent resolution.

- Preserve tests, deployment and README.

- Reduce visual polish and optional statistics first.

- Keep extras separate so the MVP remains deliverable.

## Implementation diary

### T00

- Status: Complete.

- Changed: Created .cursor/rules/project-workflow.mdc, docs/implementation-plan.md, docs/architecture.md and README.md. Plan revised with supplied Hunch design references, per-ticket UI checkpoints and prototype/production boundaries. UI specification copied from implementation plan into docs/architecture.md under a new UI design section (tokens, typography, layout, component responsibilities, application states, polling, motion, accessibility, history placeholder, prototype boundaries).

- Checks: Document consistency reviewed manually. Uploaded plan, HTML prototype source and desktop screenshots reviewed. No code, deployment or test execution performed.

- Manual verification: Confirmed by Mario.

- Decision: Cursor-native project rule; four maintained documents plus design reference assets. UI spec lives in architecture.md; reference assets added to docs/design/ during T01.

- Limitations: Application not implemented. Design reference files (docs/design/) not yet added to the repository.

- Commit: Pending.

### T01

- Status: Complete.

- Changed: Conducted bounded Grill Me architecture review. Agreed five decisions (D1–D5) and recorded them in the architecture decision log. Updated architecture.md (resolution price model, workflow startup, anonymous identity, concurrency/idempotency section, data model, UI design section). Updated implementation-plan.md (T03, T04, T05, T07, T08, T09 task details). Updated README.md (how resolution works, anonymous persistence, standard functionality, skills). UI specification copied from implementation plan into architecture.md. Both skills installed and verified. Design reference files added to docs/design/ (prototype HTML + three desktop screenshots including active-prediction state).

- Checks: Skills verified by locating and reading the actual skill files. Ponytail hook activation confirmed via session hook context. Document consistency reviewed manually after each decision. No code, deployment or test execution performed.

- Skill verification:
  - Grill Me: `.cursor/skills/grill-me/SKILL.md` present and readable. Correctly invoked this session via `/grill-me`. `disable-model-invocation: true` means it must be explicitly called; the model cannot invoke it automatically.
  - Ponytail: `.cursor/skills/ponytail/SKILL.md` present. Full source at `vendor/ponytail/`. Hooks installed in `.cursor/hooks.json` with `sessionStart` and `beforeSubmitPrompt` triggers. Active this session (PONYTAIL MODE ACTIVE confirmed).
  - Hook limitation: `.cursor/hooks.json` uses absolute machine-specific paths. Any machine cloning this repo must re-run the Ponytail hook installation script before hooks activate. Document this in README.

- Manual verification: Confirmed by Mario. Grill Me review, skill installation, hook verification and design reference files all complete.

- Decision or tradeoff: D1 (resolution price + trade timestamp), D2 (sync StartExecution + recovery scanner, no Streams), D3 (randomBytes(32) token, SHA-256 hash, timingSafeEqual), D4 (UUID idempotency key, two 409 codes), D5 (wins/losses at MVP, recovery scanner in T08).

- Remaining limitation: Ponytail hooks use absolute machine-specific paths; must be reinstalled on each new machine. No mobile screenshot was supplied; responsive layout to be confirmed during T02.

- Commit: Pending.

### T02

- Status: Complete. Verified by Mario 2026-10-07.
- What changed:
  - `package.json` (root) — Yarn workspace config, root scripts (`dev`, `build`, `typecheck`, `lint`, `test`, `check`), ESLint 9 + TypeScript ESLint + react-hooks plugin in devDependencies.
  - `tsconfig.json` (root) — project references to all three workspaces; no files compiled at root.
  - `eslint.config.mjs` — ESLint 9 flat config; strict TS rules + react-hooks; ignores `vendor/`, `dist/`, `docs/`.
  - `.env.example` — `VITE_API_BASE_URL` and `VITE_FIXTURE` documented.
  - `packages/contracts/` — package.json, tsconfig.json, `src/index.ts` (export stub). Zod installed. Types defined in T03.
  - `apps/api/` — package.json, tsconfig.json, `serverless.yml` (Serverless Framework 4, serverless-esbuild, Node 20, eu-west-1 default), `src/handlers/health.ts` (GET /health → 200 `{status:"ok"}`).
  - `apps/web/` — Vite 6, Tailwind CSS v4 (`@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS, `@theme` block), React 18, TanStack Query v5, Lucide React, Archivo Variable font, strict TypeScript, Vitest with jsdom.
  - `apps/web/src/styles/tokens.css` — full Hunch design system: CSS custom properties for all 31 tokens, base reset, all component utility classes ported from the Hunch prototype.
  - Components created: `AppHeader`, `MarketCard`, `PriceStatus`, `PredictionPanel`, `DirectionButtons`, `RoundTicket`, `ResultReceipt`, `ScoreCard`, `HowItWorks`, `StatusNotice`.
  - `apps/web/src/fixtures/index.ts` — 9 fixture states: ready, submitting, active, checking, equal-price, provider-hold, win, loss, setup-error.
  - `apps/web/src/FixtureApp.tsx` — dev-only fixture runner; dynamically imported via `?fixture=` query param; excluded from production build.
  - `apps/web/src/App.tsx` — structural layout shell; no live data yet.
  - `apps/web/src/main.tsx` — boots fixture runner in dev when `?fixture=` present, else boots App.
  - Tests: `AppHeader.test.tsx` (3 cases), `HowItWorks.test.tsx` (2 cases).
- Checks run and results:
  - `yarn install` — exit 0; lockfile created.
  - `yarn workspace web typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn workspace web test` — 5/5 passed.
  - `yarn workspace web build` — exit 0; 145 kB JS (gzip 47 kB); FixtureApp tree-shaken from production bundle.
- Manual verification: Pending.
- Decision or tradeoff:
  - Yarn Classic v1 (not v3/v4 PnP) — matches what the user has installed; avoids `.yarnrc.yml` complexity for now.
  - Tailwind v4 plugin API instead of v3 `tailwind.config.js` — matches architecture.md decision; `@theme` block replaces config file entirely.
  - `@testing-library/jest-dom` pinned to `6.9.1` — `^6.6.0` resolved to `6.10.0` which requires Node ≥ 22; Node 20 is installed.
  - Fixture runner uses dynamic `import()` in `main.tsx` — ensures the 9 fixture states and their test data are not compiled into the production build.
  - `vitest.config.ts` excluded from the main `tsconfig.json` include list — `@tailwindcss/vite` bundles its own vite version causing a type mismatch; vitest handles its own config typechecking independently.
- Remaining limitations:
  - `apps/api` typecheck runs `tsc --noEmit`; there is no bundled Lambda artifact yet (T04 covers deployment).
  - `contracts` package exports nothing yet; contents are defined in T03.
  - No live API calls; App.tsx renders placeholder props only.
  - Sparkline chart area in MarketCard is left as a placeholder — data visualisation added when real price data is available (T06).
  - Countdown ring in RoundTicket uses a hardcoded 60-second circumference; actual timer logic added in T06.
- Commit: `chore: scaffold Yarn monorepo, Hunch design system and 9 fixture states`

### T03

- Status: Complete. Verified by Mario 2026-10-07. `yarn workspace contracts test` showed 8/8 passed. The compared price is the resolution price against the stored entry price. A move before 60 seconds returns `TOO_EARLY` before any price comparison.
- What changed:
  - `packages/contracts/src/index.ts` — Zod schemas and types for direction, prediction status, outcome, decimal prices, players, predictions (including `resolutionTradeTime`), create-player token response, `GET /me`, `GET /market`, create-prediction request, history, wait reasons and errors.
  - `packages/contracts/src/evaluator.ts` — pure `evaluate()`. Caller supplies both timestamps. Price comparison uses scaled `BigInt`. Default wait is 60 seconds.
  - `packages/contracts/src/evaluator.test.ts` — 8 deterministic cases.
  - `packages/contracts/package.json` — `vitest` and `test` script.
  - `apps/web/src/fixtures/index.ts` — fixture rounds and results use `Direction`, `Outcome`, `PriceString` and `WaitReason`.
  - `apps/web/src/components/RoundTicket.tsx` — wait copy follows `WaitReason`.
  - `apps/web/tsconfig.json` — dropped the contracts project reference so `tsc --noEmit` typechecks the contracts source. A reference required a built `dist/` that this repo does not commit.
  - `docs/architecture.md` — Contracts section.
- Checks run and results:
  - `yarn workspace contracts test` — 8/8 passed.
  - `yarn workspace contracts typecheck` — exit 0.
  - `yarn workspace web typecheck` — exit 0.
  - `yarn workspace web test` — 5/5 passed.
  - `yarn lint` — exit 0.
- Manual verification: Passed. Mario ran through the evaluator tests and the 60-second rule on 2026-10-07.
- Decision or tradeoff:
  - No decimal library. Scaled `BigInt` comparison is enough for positive decimal strings.
  - `waitReason` is a field on `GET /me`, not something the client derives from the display quote.
  - Lost `POST /predictions` responses are recovered by resending the same idempotency key and direction.
- Remaining limitations:
  - Schemas are not wired to Lambda handlers yet (T04–T08).
  - `evaluate` is not called by a resolver yet. Nothing here fetches Coinbase or writes DynamoDB.
  - `minimumWaitMs` exists so tests can name the threshold. Production callers must leave it unset.
- Commit: `feat: define prediction contracts and tested scoring rules`

### T04

- Status: Complete. Mario confirmed the hosted page shows **Backend connected.** on 2026-10-11.
- What changed:
  - `apps/api/serverless.yml` — on-demand table `hunch-<stage>` with `pk`/`sk`, no streams, retained on delete. HTTP API CORS allows `http://localhost:5173` and an `amplifyOrigin` parameter. Health Lambda has no DynamoDB permission. `build.esbuild` is false so Serverless 4 keeps the `serverless-esbuild` plugin. Default region is `eu-north-1`.
  - `apps/web/src/App.tsx` — calls `GET /health`. Shows not configured, unreachable, or connected. No market card and no Up/Down buttons.
  - `apps/web/src/test/App.test.tsx` — those three states.
  - `amplify.yml` — Yarn workspace build from the repository root, output `apps/web/dist`. Uses the monorepo `applications` list because Amplify has `AMPLIFY_MONOREPO_APP_ROOT=.`.
  - `.env.example`, `README.md`, `docs/architecture.md` — public API URL, deploy commands, table keys, D6.
- Checks run and results:
  - `yarn workspace web test` — 8/8 passed.
  - `yarn workspace web typecheck` — exit 0.
  - `yarn workspace api typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn serverless package --stage dev --region eu-north-1` — exit 0. Template has `GET /health`, on-demand `hunch-dev`, no stream, and the health role can write logs only.
  - `yarn serverless deploy --stage dev --region eu-north-1` — exit 0. Stack `hunch-dev`. Health URL `https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health` returned `{"status":"ok"}`.
  - Second deploy with `amplifyOrigin=https://release.d2yczmbttcpoe9.amplifyapp.com` — exit 0. CORS preflight returns that origin. Before this deploy, the hosted page showed **Backend unreachable.** The health URL already returned `{"status":"ok"}` to `curl`. The browser blocked the call because only `http://localhost:5173` was allowed.
  - Hosted page `https://release.d2yczmbttcpoe9.amplifyapp.com` shows **Backend connected.** and **Play is not available yet.** after the origin was allowed. Mario confirmed that on refresh.
- Manual verification: Passed. Mario opened `https://release.d2yczmbttcpoe9.amplifyapp.com` on 2026-10-11 and saw **Backend connected.**
- Decision or tradeoff: Public `/health` is a connectivity check. Cost abuse is an accepted MVP limit guarded by the account credits, not by hiding the URL. Dev deploy region is `eu-north-1` because the new project account is locked to Stockholm. Root MFA stays off so the account is not permanently upgraded. See D6 in architecture.md. Reviewers use the public site and do not sign in to AWS.
- Remaining limitation: Play is not available yet. A monthly spend limit was not created, because this account only offers that after a paid upgrade. The 100 USD credits are the cap. Lambda `nodejs20.x` still deploys, and AWS stops allowing new functions on that runtime on 2027-02-01. The local `.env` file is still optional for `yarn dev`.
- Commit: `a50fd5e` plus later `bc74f7e` on `release` for the Amplify file. Suggested message for any remaining doc edit: `docs: record the deployed health API and Amplify URL`

### T05

- Status: Complete. Code is in the repo. The hosted site has not been updated.
- What changed:
  - `packages/contracts` — player ids are `anon_` plus 8 hex characters.
  - `apps/api/src/player.ts` — creates a score-0 player, hashes the token, and compares with `timingSafeEqual`.
  - `apps/api/src/playerStore.ts` — `PutItem` / `GetItem` at `PLAYER#<playerId>` / `PLAYER`, conditional on a new id.
  - `apps/api/src/handlers/createPlayer.ts` and `me.ts` — `POST /players` returns the raw token once. `GET /me` returns the score and null prediction fields. A bad token is `401`.
  - `apps/api/serverless.yml` — those two routes. CORS allows `POST`. Player Lambdas use `PlayerLambdaRole` (`GetItem`, `PutItem` only). Health stays on the log-only role.
  - `apps/web` — `hunch.session` in `localStorage`. First visit creates a player. A return visit calls `GET /me` only. Network failure keeps the session and offers retry. A rejected token does not create a replacement until the player asks. Header shows the id and score. Footer uses the server-persistence sentence.
  - Local development — `yarn dev:local` serves the frontend with an in-memory `/api` for manual create/restore testing before deployment. Restarting the dev server clears its players. It does not emulate AWS.
- Checks run and results:
  - `yarn workspace api test` — 10/10 passed.
  - `yarn workspace api typecheck` — exit 0.
  - `yarn workspace web test` — 10/10 passed.
  - `yarn workspace web typecheck` — exit 0.
  - `yarn workspace web build` — exit 0 with the local adapter excluded from the production app.
  - `yarn workspace contracts typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn serverless package --stage dev --region eu-north-1` — exit 0. Template has `POST /players`, `GET /me`, and `GET /health`. Health role has log permissions only. Player role has `dynamodb:GetItem` and `dynamodb:PutItem`.
  - Local API smoke test — `POST /api/players` followed by authenticated `GET /api/me` returned the same `anon_` player with score 0.
- Manual verification: Passed locally. On 2026-10-11 Mario ran `yarn dev` and saw **API address is not configured.** because `VITE_API_BASE_URL` was empty. `yarn dev:local` set that address to `/api`, the message disappeared, and the local player page loaded. He marked T05 complete from that check. The live site still shows the T04 health shell.
- Decision or tradeoff: Player ids are 8 hex characters, not the 4-character illustration. `GET /me` does not read predictions yet. There is no 3-second score poll. A `401` stays on the saved session until the player chooses "Start a new player". The local API is an in-memory browser-flow adapter, not a DynamoDB emulator.
- Remaining limitation: The hosted page and API do not include this ticket until deploy. That deploy must pass `--param amplifyOrigin=https://release.d2yczmbttcpoe9.amplifyapp.com`. A lost `POST /players` response can create an extra orphan player on retry, because the token was never saved. Play is still unavailable.
- Commit: Pending. Suggested message: `feat: persist anonymous player identity and score`

### T06

- Status: Complete. Code is in the repo. The hosted site has not been rebuilt with it.
- What changed:
  - `packages/contracts` — `MarketResponse.source` is `COINBASE_EXCHANGE`.
  - `apps/api/src/coinbase.ts` — uncached `fetchTicker` validates the Coinbase BTC-USD ticker, times out after 3 seconds, and throws `ProviderUnavailableError`. `displayQuote` caches one success for about 3 seconds per warm process and does not cache failures.
  - `apps/api/src/handlers/market.ts` — public `GET /market`. `isFresh` means the trade is at most 60 seconds old. Provider failure is `503 PROVIDER_UNAVAILABLE`.
  - `apps/api/serverless.yml` — `GET /market` uses the default log-only role. It cannot read DynamoDB.
  - `apps/web` — polls `/market` about every 5 seconds. Shows Live, Delayed, or Unavailable, keeps the last price on a later failure, and draws a chart only from samples collected on this page. The 1-minute change waits until a sample is 60 seconds old. The chart line stays inside the card, and its coverage label sits below the line. Up and Down stay hidden.
  - `yarn dev:local` — `GET /api/market` calls the real Coinbase ticker through `fetchTicker`.
- Checks run and results:
  - `yarn workspace api test` — 24/24 passed.
  - `yarn workspace api typecheck` — exit 0.
  - `yarn workspace web test` — 20/20 passed.
  - `yarn workspace web typecheck` — exit 0.
  - `yarn workspace contracts typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn workspace web build` — exit 0. The local adapter is serve-only.
  - `yarn serverless package --stage dev --region eu-north-1` — exit 0. Template has `GET /market` on `IamRoleLambdaExecution`. That role can write logs only. Player Lambdas still use `PlayerLambdaRole`.
  - Local `GET /api/market` returned a fresh `COINBASE_EXCHANGE` quote.
- Manual verification: Passed locally. On 2026-10-11 Mario ran `yarn dev:local`, started a new player, and saw a live Coinbase price near 83,062, score 0, and the page chart. The first chart drew outside the card. The coverage label now sits inside the card. He marked T06 complete from that check. The hosted site has not been rebuilt.
- Decision or tradeoff: A provider failure returns 503 and the browser keeps the last price. The server does not send a stale fallback. `/market` is public, with the same cost-abuse acceptance as `/health`. The client shows Delayed when the last good sample is more than 15 seconds old. Rejecting a prediction without an entry quote waits for T07.
- Remaining limitation: The hosted page does not show this price until the API deploy and the `release` Amplify build. Display age uses the browser clock. The 1-minute change is a display subtraction, not a settlement comparison. The display cache is one quote per warm Lambda, so overlapping containers can each call Coinbase.
- Commit: Pending. Suggested message: `feat: display validated BTC market prices`

### T07

- Status: Complete. Mario confirmed the local check on 2026-10-11. The hosted site has not been updated.
- What changed:
  - `packages/contracts` — a prediction requires `mode: STANDARD` and `entryTradeTime`. Direction remains `UP` or `DOWN`.
  - `apps/api` — `POST /predictions` authenticates the player, ignores client price, time, and score, and records an uncached Coinbase entry quote. A trade older than 10 seconds, or a provider failure, returns `503` and writes nothing. The same key and direction returns the stored prediction. The same key and other direction returns `409 IDEMPOTENCY_CONFLICT`. Another key while locked returns `409 ACTIVE_ROUND` without a new quote. The DynamoDB transaction puts the prediction, sets `activePredictionId` only when it is absent, and puts the idempotency item. `GET /me` returns the active prediction and `WAITING_FOR_DEADLINE` or `CHECKING_PRICE`.
  - `apps/api/serverless.yml` — `PredictionLambdaRole` allows `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems`. Table TTL uses `expiresAt` for idempotency items. No Step Functions call.
  - `apps/web` — Up and Down appear when the player is loaded, the market is Live, and no round is active. A click keeps one idempotency key in memory, locks both buttons, and shows the server entry price and countdown. An unknown result retries that key after 1, 2, and 4 seconds, then offers Retry. At zero the ticket says Checking price and shows no result.
  - `yarn dev:local` — the Vite server runs the same handlers on one in-memory store. `POST /api/__dev/next-prediction` can drop the next response or fail the next entry quote. That route is not deployed.
- Checks run and results:
  - `yarn workspace api test` — 37/37 passed.
  - `yarn workspace web test` — 25/25 passed.
  - `yarn typecheck` — exit 0 for api, web, and contracts.
  - `yarn lint` — exit 0 after the countdown effect dependency fix.
  - `yarn workspace web build` — exit 0. The local adapter is serve-only.
  - `yarn serverless package --stage dev --region eu-north-1` — exit 0. Template has `POST /predictions`, role `hunch-dev-predictions` with `dynamodb:GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems`, and table TTL on `expiresAt`. No `dynamodb:Scan`. Lambda still reports the known `nodejs20.x` deprecation warning.
- Manual verification: Passed locally. On 2026-10-11 Mario placed a round, saw it stay on Resolving / Checking price after the deadline with score 0, and saw a second tab take the first tab's round immediately. A second click in that tab is not available by hand. He marked T07 complete from that check.
- Decision or tradeoff: The one-active-prediction rule is the transaction condition. The in-memory store used by tests performs that check and write synchronously so two overlapping calls cannot both succeed. A real DynamoDB race is left for the later AWS check. Entry freshness is 10 seconds. Display freshness stays 60 seconds. `TransactWriteItems` is its own IAM action. A T07 round never settles.
- Remaining limitation: There is no production cancel. A local round stays locked until the dev server restarts or the browser starts another player. After deploy, a dev player stays locked until the prediction item is deleted and `activePredictionId` is removed. Idempotency rows expire through TTL. The hosted site is unchanged until deploy.
- Commit: Pending. Suggested message: `feat: create predictions with concurrency and retry protection`

### T08

- Status: Complete. Mario marked T08 complete on 2026-10-11. The hosted site has not been updated.
- What changed:
  - `packages/contracts` — `Prediction` may include `resolutionFetchedAt`. No other contract change.
  - `apps/api` — `decide()` refuses a quote before `dueAt`. A missing quote or a trade older than 10 seconds is `PROVIDER_HOLD` and does not change the score. `evaluate()` compares the fresh trade, using the exchange trade time as `resolvedAt`. Settlement is one `TransactWriteItems`: the prediction must still be `PENDING`, and the player lock must still be this prediction. It writes the outcome, both prices, the trade times, the fetch time, and the settled time, adds the score, increments wins or losses, sets `latestResolvedPredictionId`, and removes the lock and the index attributes. A cancelled transaction is `already_settled`. Pending items carry `pendingKey = PENDING` and `pendingDueAt = dueAt` for the sparse `pending-by-due` index. Settlement removes both.
  - Workflow — after a new round is stored, create starts `prediction-{predictionId}` with `{ playerId, predictionId, dueAt }`. `ExecutionAlreadyExists` is success. Any other start failure is logged and the handler still returns 201. The machine waits until `dueAt`, then resolves. Equal price waits 5 seconds. Provider hold waits 15 seconds. A trade that is still inside the minute returns to the deadline wait. The execution timeout is 6 hours. The definition is `apps/api/src/workflow/resolution.asl`, loaded as a string so Serverless does not parse it as JSON.
  - Scanner — `recoverStuckPredictions` runs every 5 minutes and queries `pendingDueAt` before now minus 2 minutes. It does not scan the table and it does not write a score. A finished execution cannot be restarted under the same name for 90 days, so a failed, timed-out, or aborted execution restarts as `prediction-{id}-r{epochMinutes}`.
  - `GET /me` — returns `latestResolvedPrediction` when the latest resolved id points at a resolved round. `EQUAL_PRICE` or `PROVIDER_HOLD` is reported only when `lastCheck` is less than 30 seconds old. Otherwise, after `dueAt`, the reason is `CHECKING_PRICE`.
  - `apps/web` — polls `/me` every 2 seconds while a round is active. The ticket shows the server hold reason. After settlement it shows Correct or Not this time, the point change, both prices, both trade times, the fetch time, the settled time, and the elapsed duration, until the next round is placed. Up and Down then return.
  - `yarn dev:local` — after a local create, an in-process loop waits until `dueAt` and runs the same resolver. `equal-price` makes the next resolution quote use the entry price. `resolution-provider-down` fails the next two resolution quotes. Production wait stays 60 seconds. These modes are not on API Gateway.
  - `serverless.yml` — resolver and recovery functions, the state machine, the GSI, four roles, and alarms on topic `hunch-<stage>-alerts`. The email subscription is created only when deploy passes `--param alarmEmail=...`. `serverless package` works without that parameter.
- Checks run and results:
  - `yarn workspace contracts test` — 8/8 passed.
  - `yarn workspace api test` — 59/59 passed.
  - `yarn workspace web test` — 28/28 passed.
  - `yarn typecheck` — exit 0 for api, web, and contracts.
  - `yarn lint` — exit 0.
  - `yarn workspace web build` — exit 0.
  - `yarn serverless package --stage dev --region eu-north-1` — exit 0. The template has state machine `hunch-dev-resolution` with the resolver ARN joined into the definition, GSI `pending-by-due`, schedule `rate(5 minutes)`, roles `hunch-dev-resolver`, `hunch-dev-recovery`, and `hunch-dev-resolution`, and `states:StartExecution` on the prediction role. It has no `dynamodb:Scan`. Lambda still reports the known `nodejs20.x` deprecation warning.
- Manual verification: Mario marked T08 complete on 2026-10-11. During implementation, a local round on `http://127.0.0.1:5174` went from the ticket at score 0 to a receipt reading Correct, entry 83,718.83, compared 83,748.27, both trade times, fetched and settled times, and 62 seconds elapsed. The header score became 1 and Up and Down returned.
- Decision or tradeoff: Step Functions keeps a finished execution name for 90 days, so a failed execution is not restarted under `prediction-{id}`. The scanner uses a new name. Settlement stays conditional, so a second execution cannot score twice. The scanner can leave a round pending until about 7 minutes after `dueAt`. A provider failure is never a loss. Real DynamoDB races stay for the later AWS check.
- Remaining limitation: The hosted site is unchanged until deploy. Adding the GSI can take several minutes. The SNS email must be confirmed or alarms have nowhere to go. There is no in-app cancel. A round whose workflow never starts stays pending until the scanner runs. The execution gives up after 6 hours and the scanner starts another one. The hosted browser-close check was not done in T08. It is in the T09 manual steps.
- Commit: Pending. Suggested message: `feat: resolve predictions durably and update scores atomically`

### T09

- Status: Complete. Mario marked T09 complete on 2026-10-11. The hosted site has not been updated.
- What changed:
  - `apps/web` — `/me` polls every 1 second in the last 5 seconds or during a hold, every 2 seconds for the rest of an active round, and every 3 seconds when idle. It refetches when the window focuses and does not poll in a background tab. The countdown uses the midpoint of the `/me` request, so a slow response does not shorten the minute. A failed refresh keeps the last score, labels it Last confirmed, and disables Up and Down.
  - The ticket steps are Placed, Waiting, Comparing, and Result. The copy matches the architecture, including that a price move during the minute is not final and that an outage is not a loss. The latest display price is shown with its delta and is not a settlement. Focus moves to the round heading only after this browser places the round.
  - One polite live region announces a placement, the end of the wait, a hold, and a result. It does not announce each second. The score flash and that announcement happen once per prediction, stored at `hunch.seenResult.<playerId>`. The receipt stays until the next round.
  - ScoreCard is in the right column. Accuracy, wins, and losses appear after the first settled round. A history card says settled predictions will appear here. When the market is not live, Up and Down stay visible and disabled, with the reason.
  - `docs/architecture.md` — added **Local memory and DynamoDB**. The store is chosen by the caller: `memoryGameStore()` in the Vite process, DynamoDB in each Lambda export.
- Checks run and results:
  - `yarn workspace web test` — 46/46 passed.
  - `yarn workspace api test` — 59/59 passed.
  - `yarn workspace contracts test` — 8/8 passed.
  - `yarn typecheck` — exit 0 for api, web, and contracts.
  - `yarn lint` — exit 0.
  - `yarn workspace web build` — exit 0.
- Manual verification: Mario marked T09 complete on 2026-10-11. A normal local round settled and the score changed. Some fault checks looked like a normal round: `equal-price` only holds for about 5 seconds, and a curl that misses the running server does nothing. Those checks are written out again under T14. During implementation, `?fixture=win` showed Correct and `?fixture=loss` showed Not this time. A local Up round focused “Your prediction”, showed the not-final delta, then a receipt: Not this time, entry 83,863.46, compared 83,812.58, 62 seconds, score −1 with one flash, accuracy visible, and Up returned. Focus landed on the receipt. At 375px the page did not scroll sideways and the header showed the score. Reduced motion set the score animation to 0s.
- Decision or tradeoff: Idle polling stays at 3 seconds, as the architecture already said, rather than 15 seconds. No `ExecutionsAborted` alarm was added. A stopped execution is an operator action, and the scanner still recovers it. T08 stays Complete. The hosted checks are the manual steps below, not a reason to reopen T08.
- Remaining limitation: The hosted site is unchanged until deploy. History is still a placeholder. There is no in-app cancel.
- Commit: Pending. Suggested message: `feat: complete prediction countdown and result experience`

### T10

- Status: Complete. Mario marked T10 complete on 2026-10-11.
- What changed:
  - `apps/api/src/integration/dynamo.int.test.ts` — DynamoDB condition tests. The file skips unless `DYNAMODB_ENDPOINT` is set. `yarn workspace api test:int` is the command. CI runs it against DynamoDB Local.
  - `apps/web/e2e/critical-journey.spec.ts` — one Chromium journey with a stubbed API and a test clock. Production still waits 60 seconds.
  - `apps/web/src/test/App.test.tsx` — a failed create offers Retry and does not create a new player. Stale market, equal-price, provider hold, and a seen-result remount were already covered.
  - `recoverStuckPredictions` — skips a prediction when a `prediction-<id>` or `prediction-<id>-r…` execution is still running. Logs one `prediction.recovery` line per prediction, then the summary. `prediction.created` includes `executionName`.
  - `serverless.yml` — metric filter and alarm `hunch-<stage>-workflow-start-failed`. The recovery role can `states:ListExecutions` on the state machine. The state-machine definition joins the resolver ARN between the two halves of the workflow file. CloudFormation rejected the earlier form because `Fn::Join` cannot use a function as its delimiter.
  - `.github/workflows/ci.yml` — jobs `check`, `dynamo`, and `e2e`. `serverless package` stays local.
- Checks run and results:
  - `yarn typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn test` — api 61 passed and 5 skipped, web 47 passed, contracts 8 passed. The 5 skipped tests are the DynamoDB file, because `DYNAMODB_ENDPOINT` was not set.
  - `yarn workspace api test:int` — 5 skipped. The DynamoDB cases did not run.
  - `yarn workspace web build` — exit 0. `apps/web/dist` does not contain `__dev/next-prediction`, `FixtureApp`, or `seeded`.
  - `yarn workspace web e2e` — 1 passed, after `playwright install chromium`. GitHub Actions then failed the same test: `fastForward` fires the 1s countdown once per call, so “Comparing prices” never appeared. The journey now uses `runFor` in 5s chunks, under the 8s `/me` abort. Re-run locally: 1 passed.
  - `yarn serverless package --stage dev --region eu-north-1` from `apps/api` — exit 0. The template contains the metric filter, `hunch-dev-workflow-start-failed`, and `states:ListExecutions` on the recovery role.
- Manual verification: Passed on the hosted site. On 2026-10-11 Mario pressed Up, closed the tab while the round was running, and reopened after 5 minutes. The round had settled as a loss. The API deploy of `hunch-dev` completed at 19:14, and he confirmed the SNS subscription email. The 375px layout pass was not part of this check.
- Decision or tradeoff: DynamoDB Local is a CI service. This machine did not run those cases. The scanner lists running executions so a long provider hold does not start a second recovery execution. Settlement was already conditional. The starter alarm reads the existing log line. It does not add metric-writing code.
- Remaining limitation: The tag `mvp-1.0` is not created. History is in the repo and is not on the hosted site until the next deploy. The hosted layout pass under T14 was not repeated for this confirmation.
- Commit: Pending. Suggested message: `test: verify MVP lifecycle and operational recovery`

### T11

- Status: Complete. Mario confirmed the local check on 2026-10-11. Not deployed.
- What changed:
  - `GET /predictions` lists the authenticated player's settled rounds, newest first. `limit` defaults to 20 and maxes at 50. The cursor is the base64url of the last returned sort key, and the handler rebuilds the key with the authenticated player id. Pending rounds are excluded. The query is a consistent read on the player partition. There is no history index and no table scan.
  - `HistoryLambdaRole` (`hunch-<stage>-history`) can `GetItem` and `Query` the table only.
  - `prediction.created` now includes `priorRounds` and `repeat` on a new round. An idempotent replay does not log another creation. `prediction.settled` is unchanged. These counts are not a retention or activation measurement.
  - The history placeholder is a list with loading, empty, error, and populated states. The empty copy appears only after a successful empty response. Load older rounds fetches the next page. Accuracy is labelled all settled rounds. How it works adds one step about the list and keeps the 60-second rule.
  - `yarn dev:local` serves `GET /api/predictions` on the memory store, including the cursor query string.
- Checks run and results:
  - `yarn workspace contracts test` — 8/8 passed.
  - `yarn workspace api test` — 70 passed and 6 skipped. The skipped tests are the DynamoDB file, because `DYNAMODB_ENDPOINT` was not set. That file now includes a `listResolved` page test.
  - `yarn workspace web test` — 54/54 passed.
  - `yarn workspace web e2e` — 1 passed. After the first result the journey sees the history row.
  - `yarn typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn workspace web build` — exit 0. `apps/web/dist` does not contain `FixtureApp`, `__dev/next-prediction`, or `seeded`.
  - `yarn serverless package --stage dev --region eu-north-1` from `apps/api` — exit 0. The template has `GET /predictions` and `hunch-dev-history` with `dynamodb:GetItem` and `dynamodb:Query` on the table. It has no `dynamodb:Scan`. Lambda still reports the known `nodejs20.x` deprecation warning.
- Manual verification: Passed locally on 2026-10-11. Mario confirmed the history check works.
- Decision or tradeoff: No infinite scroll, no per-row receipt, and no streak fields. The open round stays on the ticket. Accuracy stays the all-time `wins` and `losses` from `GET /me`. Repeat play is two fields on the existing creation log. The history role may query the whole table; ownership is the authenticated partition key.
- Remaining limitation: The hosted site still shows the placeholder until the API deploy and the Amplify rebuild. A player with fewer than 20 settled rounds does not see Load older rounds. If a player has exactly 20, DynamoDB can return a cursor when the next page is empty; Load older rounds then reports that every round is loaded. Pagination of a longer list is covered by the handler test. `yarn workspace api test:int` was not run on this machine.
- Commit: Pending. Suggested message: `feat: add prediction history and transparent progress`

### T12

- Status: Complete. Mario marked the local check done on 2026-10-11. Not deployed. T13 has not started.
- What changed:
  - A standard win creates one Double Down offer when `FEATURE_DOUBLE_DOWN` is `on`. The offer id is `o_` plus the parent prediction id. The deadline is an ISO string, because a numeric `expiresAt` would be deleted by the table TTL. Expiry is derived on read. Need more time adds 20 seconds, at most 10 times.
  - Accept starts a `DOUBLE_DOWN` round in the parent's direction, with a fresh entry and the same 60-second wait. `evaluate()` stays ±1. `scoreFor` maps a bonus round to ±2. The original +1 is not rewritten. A bonus win does not create another offer. Decline, expiry, and a new standard round end the offer. Accept and create cannot both succeed.
  - The flag defaults off. `yarn dev:local` defaults it on. `next-resolution-win` is a local-only fault. The offer role can read and write the table and start a resolution. The resolver can `PutItem` so the win transaction can put the offer.
  - The offer panel, bonus ticket, bonus receipt, and history pair are in the existing screens. Up and Down move below the offer while it or its notice is showing. `?fixture=dd-offer` and the other `dd-` names are in the preview list.
- Checks run and results:
  - `yarn typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn test` — api 82 passed and 8 skipped, web 59 passed, contracts 11 passed. The 8 skipped tests are `dynamo.int.test.ts`, because `DYNAMODB_ENDPOINT` was not set. That file now includes the offer settlement, the accept race, the accept-versus-create race, and the extend race. Those cases did not run on this machine. CI runs them.
  - `yarn workspace web build` — exit 0. `apps/web/dist` does not contain `FixtureApp` or `__dev/next-prediction`.
  - `yarn workspace web e2e` — 2 passed. The second journey accepts a stubbed offer, shows the pair total +3, the expiry copy after the tab has seen the offer, and the replaced notice. The viewport is 375px wide.
  - `yarn serverless package --stage dev --region eu-north-1` from `apps/api` — exit 0. The template has the three offer routes, `OfferLambdaRole`, `FEATURE_DOUBLE_DOWN`, and `dynamodb:PutItem` on the resolver. It has no `dynamodb:Scan`. Lambda still reports the known `nodejs20.x` deprecation warning.
- Manual verification: Mario marked T12 complete on 2026-10-11. During implementation, `?fixture=dd-offer` showed +1 kept, pair +3 and −1, identical Double down and No thanks buttons, and Up/Down under the title “Nice call. Bonus round?”. A local `next-resolution-win` round in the browser settled Correct, score +1, and the tab then showed “Offer ended. Your +1 is kept.” after the 10-second window. The hosted site is unchanged.
- Decision or tradeoff: The offer deadline is an ISO string so the idempotency TTL does not delete it. See D7. The initial window stays 10 seconds. Need more time is the WCAG 2.2.1 extension, 20 seconds, 10 times. Wins and losses still count a bonus round as one round.
- Remaining limitation: Hosted Double Down stays off until a deploy passes `--param doubleDown=on`. The DynamoDB race tests did not run on this machine. A bonus round still takes at least 60 seconds.
- Commit: Pending. Suggested message: `feat: add optional momentum double-down rounds`

### T13

- Status: Complete. Mario marked the local check done on 2026-10-11. Not deployed.
- What changed:
  - A standard loss creates one Redemption offer when `FEATURE_REDEMPTION` is `on`. The offer has no direction. A standard win still creates only a Double Down offer, and only when that flag is on. A follow-on settlement creates no offer. The parent −1 is not rewritten. `scoreFor('REDEMPTION', WIN)` is +4 and `LOSS` is −2. `payoutFor` returns `{ win: 4, loss: -2, parentDelta: -1 }`, so the pair totals are +3 and −3. Decline, expiry, and a new standard round keep the −1. Accept requires `UP` or `DOWN` before any write. A missing or invalid direction is `400 DIRECTION_REQUIRED` and leaves the offer open. Double Down still ignores a client direction.
  - The same idempotency key with the same offer and a different direction is `409 IDEMPOTENCY_CONFLICT`. The same direction replays. Accept stores `chosenDirection` and starts a fresh 60-second round in mode `REDEMPTION`. `wins` and `losses` still increase by 1. An old offer item with no `mode` still reads as `DOUBLE_DOWN`.
  - `FEATURE_REDEMPTION` defaults off in `serverless.yml`. `yarn dev:local` defaults it on when the variable is unset. `next-resolution-loss` is a local-only fault. No new routes or IAM roles.
  - The offer card is shared with Double Down. Redemption shows “Go again?”, the loss receipt, tiles from `offer.payout`, and three equal buttons: Play Up, Play Down, and No thanks. Seen offer ids for both modes are the last 10 in `sessionStorage` at `hunch.seenOffers`. The visible name is the constant `REDEMPTION_NAME` (`Redemption`). `?fixture=rd-offer` and the other `rd-` names are in the preview list, including `rd-second-call`.
- Checks run and results:
  - `yarn typecheck` — exit 0.
  - `yarn lint` — exit 0.
  - `yarn test` — api 91 passed and 10 skipped, web 66 passed, contracts 11 passed. The 10 skipped tests are `dynamo.int.test.ts`, because `DYNAMODB_ENDPOINT` was not set. `yarn workspace api test:int` skipped the same 10. Docker is not installed on this machine, so those cases did not run. CI runs them. The file includes the Redemption settle-once accept race and the accept-versus-create race.
  - `yarn workspace web build` — exit 0. `apps/web/dist` does not contain `FixtureApp`, `__dev/next-prediction`, or `seeded`.
  - `yarn workspace web e2e` — 8 passed. Six cover a stubbed Redemption loss through Play Down and a +4 pair, expiry, No thanks, a main Up with no notice, another tab, refresh, a 375px layout, and reduced-motion pips. The two existing journeys still pass.
  - `yarn serverless package --stage dev --region eu-north-1` from `apps/api` — exit 0. The template has `FEATURE_REDEMPTION` defaulting to `off` on the existing functions. It has no new Lambda or IAM role, and no `dynamodb:Scan`. Lambda still reports the known `nodejs20.x` deprecation warning.
- Manual verification: Mario marked T13 complete on 2026-10-11. The hosted site is unchanged.
- Decision or tradeoff: The arithmetic stays +4/−2. At roughly even odds, accepting is worth about +1, so declining is never the better score. That note is D8. The name is a constant, not a config system. Welcome-back copy is only for a Redemption round that settled while the page was closed.
- Remaining limitation: Hosted Redemption stays off until a deploy passes `--param redemption=on`. The DynamoDB race tests did not run on this machine. A Redemption round still takes at least 60 seconds. The ticket strip uses the offer payout, so that strip is gone once the offer leaves `GET /me`.
- Commit: Pending. Suggested message: `feat: add optional redemption rounds`

### T14

- Status: In progress. README drafted. Deploy with both modes on, screenshots, and the hosted "Final manual test" are still open.
- What changed:
  - The active round is one section. The heading is "You called Up" or "You called Down", with a phase eyebrow, a dial, three figures (entry, latest, vs entry), the step line, and "You can close this page." Focus stays on `#play-title`. "Checked Ns ago" is the age of the last successful `/me` poll and only shows after the minimum wait. History rows use a bare arrow, and a pair list is a block so its price line stays on one line.
  - `README.md`: rewritten for reviewers. It now has:
    - links and the brief requirements table
    - how to play and the screenshot slots
    - how it works (diagram, fairness, reliability, identity) and the optional modes
    - run locally (fixtures and the fault switch), tests (unit, Playwright, DynamoDB Local, CI) and deploying your own copy
    - a configuration table, repository structure, limitations and AI assistance

    The per-ticket T05–T13 manual checks were removed from the README. The full checklist stays in **Final manual test** above.
- Checks run and results: README commands were checked against `package.json`, `serverless.yml`, `amplify.yml`, `.github/workflows/ci.yml`, `localDev.ts` and the fixture list. The secrets scan of tracked files found no AWS keys or Serverless access keys. After the active-round redesign: `yarn workspace web test` 79 passed, `yarn workspace web typecheck` exit 0, `yarn lint` exit 0, `yarn workspace web e2e` 8 passed. Fixtures `active`, `checking`, `provider-hold`, `rd-active` and `dd-history` were checked in the browser at 375px and 1024–1080px. Reduced motion sets the comparing arc animation to none.
- Manual verification: the fixture pass above is done. The hosted check is still pending. Mario will:
  - deploy with `--param doubleDown=on --param redemption=on`
  - run the hosted steps 15–24 above
  - save `ready.png`, `active.png`, `result.png`, `history.png` and `mobile.png` in `docs/screenshots/`
  - remove the README's "Hosted build pending redeploy" line
  - rehearse the release walkthrough
- Decision or tradeoff: the hosted build turns both optional modes on. Screenshots come from the hosted site, not fixtures.
- Remaining limitation: the README's screenshot images do not exist until they are captured. `docs/architecture.md` Status is updated after the deploy, not before.
- Commit: Pending. Suggested message: `docs: complete release handover and walkthrough`

### Future entry template

- Ticket:

- What changed:

- Checks run and results:

- Manual verification:

- Decision or tradeoff:

- Remaining limitation:

- Commit:
