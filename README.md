# BTC Prediction Game

An epilot coding assignment: predict whether BTC/USD will be higher
or lower after at least one minute.

## Implementation status

Planning stage.
Application and AWS infrastructure are not implemented yet.

## Links

- Deployed application: Not deployed yet.
- Public repository: Add repository URL.

## Standard functionality

Planned:
- Anonymous player starts with score 0.
- Display current score, accuracy stats and latest available BTC/USD price.
- Predict Up or Down.
- One active prediction per player.
- Backend waits at least 60 seconds.
- Equal entry/resolution price keeps the round pending.
- Correct prediction adds 1 point.
- Incorrect prediction subtracts 1 point.
- Backend persists score, wins, losses and predictions.
- Browser reopening restores identity and active state.
- Backend resolution continues when the browser is closed.
- Result receipt shows entry price, compared price and trade timestamp.

## Optional features

Planned after the verified MVP:
- Recent prediction history.
- Fairness explanation.
- Momentum Double Down.
- Redemption Round.

Optional modes do not change standard scoring.
Their precise rules and availability will be documented when implemented.

## Proposed stack

- React, TypeScript and Vite.
- Tailwind CSS and Lucide.
- TanStack Query and Zod.
- API Gateway HTTP API.
- TypeScript AWS Lambda.
- DynamoDB.
- Step Functions Standard.
- Serverless Framework.
- Coinbase Exchange public BTC-USD data.
- AWS Amplify Hosting.
- Vitest, React Testing Library and Playwright.
- CloudWatch and GitHub Actions.

## Repository structure

- .cursor/rules/project-workflow.mdc: agent working instructions.
- docs/implementation-plan.md: tickets, checkpoints and diary.
- docs/architecture.md: design, decisions and recovery guidance.
- apps/web: frontend, planned.
- apps/api: backend and infrastructure, planned.
- packages/contracts: shared Zod schemas, types and the scoring evaluator.
- .cursor/skills: verified project skills, planned.

## Prerequisites

Exact supported versions will be recorded during scaffolding.

Expected:
- Node.js and npm.
- Git.
- AWS CLI and an AWS account for deployment.
- Serverless Framework authentication where required.

Never commit AWS credentials or anonymous player tokens.

## Local development

Not implemented yet.
Add verified installation, environment and startup instructions at T02.

## Testing

Not implemented yet.

Planned coverage:
- Time and scoring rules.
- Equal-price handling.
- Provider failures.
- Concurrent prediction creation.
- Duplicate settlement.
- Identity restoration.
- Critical browser journey.

## Deployment

Not implemented yet.

Planned:
- Backend infrastructure through Serverless Framework.
- Frontend through Amplify Hosting.

Add exact account/profile, region, stage, commands, hosting settings
and environment configuration after successful deployment.

## How resolution works

When a prediction is accepted, the backend records an entry quote and a
deadline (at least 60 seconds from acceptance), then starts a Step
Functions workflow using a deterministic execution name. The workflow
waits until the deadline, then retrieves a fresh quote from Coinbase.

If the quote price differs from the entry price, the round is settled.
If equal, the workflow waits and retries. Provider outages pause the
round without counting as a loss.

The settlement stores the compared price and the exchange-reported trade
timestamp, so the result receipt can prove the 60-second rule was
satisfied independently of when the backend fetched the price.

Movements during the first minute do not settle the prediction.
If the workflow fails to start (rare), a scheduled recovery scanner
detects the stuck prediction within five minutes and restarts it.

## Anonymous persistence

No account or login required. On first visit the backend creates a player
and generates a random secret token (256-bit, cryptographically random).
The token is returned to your browser once and saved to `localStorage`.
The backend stores only a hash of that token — never the token itself —
so a database breach cannot impersonate players.

On every return visit your browser sends the stored token. The backend
hashes it, matches it to the stored hash, and restores your score and
active round. The token never leaves your browser except in API requests
over HTTPS.

Clearing browser storage loses anonymous access. Cross-device restoration
is outside the initial scope.

## Product rationale

Prioritise clarity, fairness and reliable completion.
History supports transparency.
Optional modes test whether voluntary continuation improves engagement.

Commercial value is a hypothesis, not a demonstrated outcome.

## Known limitations

- Application is not implemented yet.
- Anonymous identity will be browser-specific.
- Market sampling and provider availability affect resolution time.
- Optional game-mode rules remain proposed until confirmed.

## AI assistance and skills

AI assistance is used for planning, implementation and review.
Changes are reviewed and verified by the author.

Two project-scoped skills are installed:

- **Grill Me** — structured architecture review, one question at a time.
  Invoke explicitly with `/grill-me`. Cannot be invoked automatically by
  the model (`disable-model-invocation: true`).
  Located at `.cursor/skills/grill-me/SKILL.md`.

- **Ponytail** — enforces minimal, lazy solutions during coding.
  Located at `.cursor/skills/ponytail/SKILL.md`.
  Full source preserved at `vendor/ponytail/` (unmodified).

Ponytail hooks are installed in `.cursor/hooks.json` and activate
automatically at session start and before each prompt. The hook file
contains **absolute paths specific to this machine**. On any other
machine, re-run the Ponytail hook installation script from `vendor/ponytail/`
before the hooks will activate. Do not commit the regenerated hooks.json
without checking the paths are correct for the target machine.

## Screenshots

Add screenshots of implemented functionality before submission.