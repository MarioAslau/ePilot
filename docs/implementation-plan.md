# Implementation Plan

## Goal

Deliver a deployed BTC/USD prediction game satisfying the epilot assignment.
Then add optional features that demonstrate product judgment.

## Current progress

- Active ticket: T00
- Status: In progress
- Starting point: Git repository created; application not implemented.

## Working agreement

Follow .cursor/rules/project-workflow.mdc.

For every ticket:
1. Inspect relevant files.
2. Explain the approach.
3. Implement only that ticket.
4. Run relevant checks.
5. Provide manual testing steps.
6. Stop for Mario's verification.
7. Update documents and diary.
8. Commit after approval, then start the next ticket.

Status values:
- Not started
- In progress
- Awaiting manual verification
- Complete
- Blocked

Do not treat generated code or passing unit tests as proof that
the deployed user journey works.

## Ticket overview

- [ ] T00 — Establish project documentation
- [ ] T01 — Install skills and clarify the plan
- [ ] T02 — Scaffold TypeScript projects
- [ ] T03 — Define contracts and test game rules
- [ ] T04 — Deploy a minimal AWS slice
- [ ] T05 — Create and restore anonymous players
- [ ] T06 — Display validated BTC prices
- [ ] T07 — Create predictions safely
- [ ] T08 — Implement durable resolution
- [ ] T09 — Complete the frontend game loop
- [ ] T10 — Verify and freeze the MVP
- [ ] T11 — Add history and fairness explanation
- [ ] T12 — Add Momentum Double Down
- [ ] T13 — Add Redemption Round
- [ ] T14 — Release and prepare the walkthrough

## T00 — Establish project documentation

Status: In progress
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

## T01 — Install skills and clarify the plan

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
- Do not assume Claude-specific hooks work in Cursor.
- Run a bounded Grill Me review of the MVP.
- Record agreed decisions in architecture and plan documents.

Grill Me prompt:
Use the installed Grill Me skill.
Read the project rule, implementation plan and architecture.
Ask one question at a time.
Prioritise fairness, identity, concurrency, workflow startup,
provider failure and deployment.
Keep the review focused on the MVP and approximately 15 minutes.
Do not code or add features.
Summarise agreed decisions and update the documents.

Acceptance:
- Both skills have been verified.
- Integration limitations are documented.
- Important MVP ambiguities are resolved or explicitly recorded.

Manual checkpoint:
Confirm the agent identifies the actual skill file it used.

Suggested commit:
chore: add verified Cursor skills and planning decisions

## T02 — Scaffold TypeScript projects

Status: Not started
Dependencies: T01.

Tasks:
- Confirm a supported Node.js LTS version.
- Use npm workspaces and commit the lockfile.
- Create apps/web with React, TypeScript and Vite.
- Create apps/api for TypeScript Lambda application code.
- Create packages/contracts for shared types and Zod schemas.
- Add Tailwind, Lucide and TanStack Query to the frontend.
- Configure strict TypeScript, linting and Vitest.
- Add root scripts for dev, build, typecheck, lint, test and check.
- Add .gitignore and .env.example.
- Build a minimal dark frontend shell.
- Pin Serverless Framework and check its build/auth requirements.
- Avoid redundant build plugins if native bundling is sufficient.

Acceptance:
- Dependencies install successfully.
- Typecheck, lint, tests and build run.
- Local frontend opens.
- No game functionality is claimed yet.

Manual checkpoint:
Run the documented commands from the repository root.

Suggested commit:
chore: scaffold TypeScript frontend and serverless backend

## T03 — Define contracts and test game rules

Status: Not started
Dependencies: T02.

Tasks:
- Define UP/DOWN and prediction lifecycle types.
- Define server timestamps and price metadata.
- Choose decimal-safe prices with strings at storage/API boundaries.
- Implement a pure evaluator with an injected clock.
- Define proposed API requests, responses and errors.
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
- Define an on-demand DynamoDB table.
- Configure IAM, timeouts, resource tags and log retention.
- Package and inspect infrastructure before deployment.
- Deploy the dev backend.
- Connect Amplify Hosting to the GitHub repository.
- Configure apps/web build settings and SPA fallback.
- Set public VITE_API_BASE_URL.
- Configure allowed frontend origins and CORS.
- Test frontend-to-backend connectivity.

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
- POST /players creates player ID, score 0 and an opaque access token.
- Store the token hash in the backend.
- Store player ID and raw token in browser localStorage.
- GET /me authenticates and returns score and active prediction.
- Restore identity on startup.
- Do not reset identity on a temporary network failure.
- Document storage-clearing and cross-device limitations.

Tests:
- Initial score 0.
- Existing player restores.
- Invalid token rejected.
- Network errors do not create replacement players.

Manual checkpoint:
Refresh, close and reopen the browser.
Confirm the same player is restored.
Confirm incognito creates another player.

Suggested commit:
feat: persist anonymous player identity and score

## T06 — Display validated BTC prices

Status: Not started
Dependencies: T05.

Tasks:
- Implement Coinbase adapter with timeout and response validation.
- Implement GET /market.
- Return price, source and timestamps.
- Poll display price using TanStack Query.
- Preserve last available price with an honest stale/error indicator.
- Keep display caching separate from fresh settlement quotes.
- Reject new predictions if a valid entry quote cannot be fetched.

Tests:
- Valid response.
- Malformed response.
- Timeout and rate limit.
- Loading and stale UI states.

Manual checkpoint:
Confirm price display and simulate a failed request.

Suggested commit:
feat: display validated BTC market prices

## T07 — Create predictions safely

Status: Not started
Dependencies: T06.

Tasks:
- Authenticate and validate direction/idempotency key.
- Fetch entry quote on the backend.
- Record server createdAt and dueAt.
- Transactionally create prediction and lock player.
- Enforce no existing active prediction.
- Store retry/idempotency information.
- Return the original prediction for a duplicate request.
- Reject reuse of a key with a different payload.
- Implement Up/Down submission and locked UI state.
- Reconcile state after response timeout.

Tests:
- Concurrent submissions create one active prediction.
- Duplicate request returns original result.
- Lost response can be retried safely.
- Client price/time/score cannot control the round.

Manual checkpoint:
Double-click and submit from two tabs.
Confirm only one active prediction exists.

Suggested commit:
feat: create predictions with concurrency and retry protection

## T08 — Implement durable resolution

Status: Not started
Dependencies: T07.

Tasks:
- Add DynamoDB Stream trigger for new prediction records.
- Implement workflow starter with deterministic execution name/input.
- Handle duplicate stream delivery safely.
- Configure failed-delivery handling and recovery.
- Define Step Functions Standard workflow.
- Wait until server dueAt.
- Invoke resolver and reload prediction state.
- Verify deadline before evaluating.
- Fetch a fresh valid price.
- Equal price: wait and retry.
- Provider failure: retry/backoff without scoring.
- Differing price: transactionally settle, update score and clear lock.
- Condition settlement on unresolved status and matching active ID.
- Return stored result for duplicate settlement.
- Store resolution quote and timestamps.

Tests:
- No early settlement.
- Equal-price retry.
- Provider failure.
- Duplicate workflow start.
- Duplicate settlement.
- Transaction failure leaves consistent state.
- Recovery does not double-score.

Manual checkpoint:
Submit and close the browser.
Reopen after the deadline and inspect confirmed backend state.

Acceptance:
- Browser-independent resolution works.
- Score effect occurs once despite retries.
- Startup and workflow failures have a documented recovery path.

Suggested commit:
feat: resolve predictions durably and update scores atomically

## T09 — Complete the frontend game loop

Status: Not started
Dependencies: T08.

Tasks:
- Poll player state while active.
- Invalidate cached state after mutations.
- Show server-deadline countdown with clock-offset consideration.
- At zero show Checking price.
- Explain equal-price pending state.
- Show outcome, entry/exit prices and score delta.
- Restore active/result state after refresh.
- Re-enable actions from confirmed backend state.
- Prevent duplicate result animations.
- Support mobile, keyboard focus and reduced motion.

Tests:
- Active round disables new guesses.
- Timer zero does not invent a result.
- Restored state renders.
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
- Add one deterministic Playwright critical journey.
- Manually verify deployed production timing.
- Add GitHub Actions for checks and build.
- Add structured lifecycle logs without tokens.
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

Suggested commit:
test: verify MVP lifecycle and operational recovery

## T11 — History and fairness explanation

Status: Not started
Dependencies: MVP gate passed.

Tasks:
- Add authenticated, paginated GET /predictions.
- Query the player's records without full-table scans.
- Show direction, prices, outcome, timestamps and score delta.
- Add a plain-language How it works panel.
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

- Status: In progress.
- Changed: Initial project instructions and planning documents.
- Checks: Not yet reviewed.
- Manual verification: Pending Mario's review.
- Decision: Cursor-native project rule; four maintained documents.
- Limitations: Application not implemented.
- Commit: Pending.

### T01

- Status: Awaiting manual verification.
- What changed:
  - `.cursor/skills/grill-me/SKILL.md` and `agents/openai.yaml` — copied from
    mattpocock/skills via `npx skills@latest add mattpocock/skills --agent cursor
    --copy --skill grill-me -y`. The skills CLI (v1.7.0) placed its own copy in
    `.agents/skills/grill-me/`; the `.cursor/skills/` copy was made manually to
    match Cursor's native skill directory.
  - `.cursor/skills/ponytail/SKILL.md` — copied from DietrichGebert/ponytail via
    `npx skills@latest add DietrichGebert/ponytail --agent cursor --copy --skill
    ponytail -y`. Same dual-directory note applies.
  - `vendor/ponytail/` — git submodule pinned to `552acd5` from
    `https://github.com/DietrichGebert/ponytail`. Added with
    `git submodule add … vendor/ponytail`. Submodule is read-only: no files
    inside it are modified by this project.
  - `.cursor/hooks.json` — generated by
    `node vendor/ponytail/scripts/cursor-hooks.js install --project`. Contains
    machine-specific absolute paths; gitignored; not committed.
  - `.gitignore` — added `.cursor/hooks.json` entry.
  - `README.md` — added skill descriptions, hook behaviour, developer setup and
    uninstall instructions.
  - `.agents/skills/` — created by the skills CLI as its own registry; committed
    alongside `.cursor/skills/`.
- Checks run and results:
  - `node -e "JSON.parse(…'hooks.json')"` — valid JSON, exit 0.
  - `ls vendor/ponytail/hooks/ vendor/ponytail/scripts/` — all required scripts
    present.
  - `ponytail.mdc` — absent from `.cursor/rules/`; confirmed.
  - `project-workflow.mdc` — unchanged; confirmed.
- Manual verification: Passed. sessionStart delivered `PONYTAIL MODE ACTIVE — level: full` in a new chat. Level switch to `lite` and back to `full` confirmed via beforeSubmitPrompt hook. Skills visible in Cursor `/` menu.
- Decision or tradeoff:
  - Submodule at `vendor/ponytail/` rather than a gitignored clone. Pins a
    specific commit and is reproducible with one command
    (`git submodule update --init`).
  - `.cursor/hooks.json` is gitignored (machine-specific absolute paths). Each
    developer re-runs the installer.
  - `ponytail.mdc` is not installed. The hooks manage level activation. Adding
    the rule file would silently disable hooks for all workspace users.
  - Skills CLI v1.7.0 warns about Node 20 (requires ≥22) but runs correctly.
    Its canonical install directory is `.agents/skills/`; `.cursor/skills/` is
    Cursor's native path and was populated separately.
- Remaining limitation:
  - Hook behaviour was verified by Ponytail upstream on Cursor 3.20.17; this
    project runs 3.8.22. Live session output is the authoritative evidence.
  - Subagents and cloud agents do not receive the ruleset via hooks.
  - `sessionStart` is fire-and-forget; a prompt sent within the first fraction
    of a second of a new chat may miss the context attachment.
  - Mode state (`~/.cursor/.ponytail-active`) is one flag per user, shared
    across all open Cursor conversations.
- Commit: Pending after Mario's verification.

### Future entry template

- Ticket:
- What changed:
- Checks run and results:
- Manual verification:
- Decision or tradeoff:
- Remaining limitation:
- Commit: