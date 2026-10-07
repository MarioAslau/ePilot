# Implementation Plan

## Goal

Deliver a deployed BTC/USD prediction game satisfying the epilot assignment.

Then add optional features that demonstrate product judgment.

## Current progress

- Active ticket: T02
- Status: Complete

- Starting point: Git repository created; application not implemented.

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
- Basic How it works is MVP functionality, not deferred to T11. Persisted paginated history remains T11. Before then, use an honest “History coming next” placeholder or omit the history card; never tell an existing player they have no rounds just because history is not wired.

### Prototype behaviour that must not leak into production

The HTML uses a seeded random price walk, an in-page mock server, fake in-memory credentials, fixed RPC delays and simulated tab closure. It does not prove backend persistence, actual browser-close resolution or AWS correctness. It only implements standard +1/-1 rounds.

- Keep scenario controls, time skips and seeded outcomes in local test fixtures only. Production timing remains at least 60 seconds.
- Do not copy its integer-cent precision assumption: exact provider prices and decimal-safe comparisons remain authoritative. If rounded quotes look equal but the exact result differs, provide additional precision in the receipt.
- Do not copy full player history into every `/me` response. Return active prediction and an identifiable latest result; paginate history in T11. Define this response in T03 so T09 can restore results without implementing the history feature early.
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
| T11–T13 | Real history, then separately designed and tested optional offers. |

A local fixture view helps test presentation without waiting for markets. It is not proof of backend fairness. Each backend ticket gets API/integration checks and its relevant browser checkpoint.

## Ticket overview

- [x] T00 — Establish project documentation
- [x] T01 — Verify skills, clarify architecture and approve UI
- [x] T02 — Scaffold TypeScript projects and testable UI
- [ ] T03 — Define contracts and test game rules

- [ ] T04 — Deploy a minimal AWS slice

- [ ] T05 — Create and restore anonymous players

- [ ] T06 — Display validated BTC prices

- [ ] T07 — Create predictions safely

- [ ] T08 — Implement durable resolution and playable core loop

- [ ] T09 — Complete frontend states and interaction polish

- [ ] T10 — Verify and freeze the MVP

- [ ] T11 — Add persisted history and progression

- [ ] T12 — Add Momentum Double Down

- [ ] T13 — Add Redemption Round

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

Status: Not started

Dependencies: T02.

Tasks:

- Define UP/DOWN and prediction lifecycle types.

- Define server timestamps and price metadata.
- Include `resolutionTradeTime` (exchange trade timestamp from Coinbase ticker `time` field) in the Prediction type and resolution response. This is distinct from the Lambda fetch time and proves the compared price is post-deadline. See D1 in architecture.md decision log.

- Choose decimal-safe prices with strings at storage/API boundaries.

- Implement a pure evaluator with an injected clock.

- Define proposed API requests, responses and errors.
- Include `/me` activePrediction, latest resolved prediction and server time; identify the result by prediction ID so it can restore and avoid duplicate feedback.
- Define backend wait reasons, quote freshness and recoverable errors needed by the UI. Do not infer provider/equal-price resolution status from the display quote.
- Connect local fixture shapes to these contracts and define indeterminate submission recovery.

- Define anonymous token and idempotency-key handling.

- Document contracts in docs/architecture.md.

Tests:

- UP and DOWN wins/losses.

- Before 60 seconds: no settlement.

- At the deadline: eligible for evaluation.

- Equal price: retry.

- Display rounding cannot determine the outcome.

- Standard score delta is exactly +1 or -1.

Acceptance:

- Domain rules pass deterministic tests.

- Contracts are documented.

Manual checkpoint:

Explain which price is compared and why early movements do not settle.

Suggested commit:

feat: define prediction contracts and tested scoring rules

## T04 — Deploy a minimal AWS slice

Status: Not started

Dependencies: T03.

Manual preparation:

- Configure AWS CLI access without root access keys.

- Confirm the account using aws sts get-caller-identity.

- Select one region and a dev stage.

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

Status: Not started

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

Status: Not started

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

- Reject new predictions if a valid entry quote cannot be fetched.

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

Status: Not started

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

T07 limitation: durable settlement is implemented in T08. Use an isolated dev player for this checkpoint and an explicit dev-only cleanup procedure if necessary; do not expose a production reset/cancel action.

Suggested commit:

feat: create predictions with concurrency and retry protection

## T08 — Implement durable resolution and playable core loop

Status: Not started

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

- Implement recoverStuckPredictions Lambda on a five-minute CloudWatch schedule. Query for Prediction records in status `pending` with `dueAt` more than two minutes past and no active execution. Call StartExecution with the same deterministic name for each. Alert on scanner failure (D2).
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

Status: Not started

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

Status: Not started

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

- [ ] New player starts at 0.

- [ ] Browser reopening restores player and score.

- [ ] Latest available price and score are visible.

- [ ] Up/Down works.

- [ ] Only one prediction can be active.

- [ ] Backend owns price and time.

- [ ] No settlement before 60 seconds.

- [ ] Equal price remains pending.

- [ ] Correct +1/-1 settlement.

- [ ] Duplicate calls cannot score twice.

- [ ] Closing browser does not cancel resolution.

- [ ] Critical automated tests pass.

- [ ] Deployed smoke test passes.

- [ ] Public repository, deployed link and README exist.
- [ ] Responsive playable UI includes loading/recovery and fair pending states.
- [ ] Basic rules/source/persistence explanations are available.
- [ ] No simulated prices, speed controls or fake persistence are exposed as production functionality.

Suggested commit:

test: verify MVP lifecycle and operational recovery

## T11 — Persisted history and progression

Status: Not started

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

Status: Not started

Dependencies: T11 and reliable resolution.

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

Status: Not started

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

Status: Not started

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

### Future entry template

- Ticket:

- What changed:

- Checks run and results:

- Manual verification:

- Decision or tradeoff:

- Remaining limitation:

- Commit:
