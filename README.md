# BTC Prediction Game

An epilot coding assignment: predict whether BTC/USD will be higher
or lower after at least one minute.

## Implementation status

T00 through T06 are complete in the repo. `yarn dev:local` creates a player and shows a real Coinbase BTC-USD price. The hosted site shows that price after the API deploy and the Amplify rebuild. Play is not available yet.

## Links

- Deployed application: https://release.d2yczmbttcpoe9.amplifyapp.com
- Health check: https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health
- Public repository: https://github.com/MarioAslau/ePilot

## Standard functionality

Implemented:
- Anonymous player starts with score 0.
- The browser restores that player and shows the server score.
- The page shows the latest validated BTC-USD price, its source, its age, and a chart collected on this page.

Planned:
- Display accuracy stats.
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
- apps/web: React frontend.
- apps/api: Lambda handlers and Serverless infrastructure.
- packages/contracts: shared Zod schemas, types and the scoring evaluator.
- .cursor/skills: verified project skills.

## Prerequisites

Exact supported versions will be recorded during scaffolding.

Expected:
- Node.js and npm.
- Git.
- AWS CLI and an AWS account for deployment.
- Serverless Framework authentication where required.

Never commit AWS credentials or anonymous player tokens.

## Local development

Install dependencies once from the repository root:

```bash
yarn install
```

Run the frontend with a development-only in-memory player API:

```bash
yarn dev:local
```

Open `http://localhost:5173`. The local API supports `POST /api/players`
and `GET /api/me`. `GET /api/market` calls the public Coinbase BTC-USD
ticker, so the price on this page is real. Player records stay in memory
and do not need AWS credentials, a deployment, or DynamoDB.

Refresh or close and reopen the browser while the command is still running
to verify restoration. An incognito window creates a different player.
Restarting `yarn dev:local` clears the in-memory players; the browser will
then show that its saved player was rejected. Choose **Start a new player**
to recover.

This adapter checks the browser flow. Automated API tests cover the
production handlers and token hashing. DynamoDB, IAM and API Gateway are
proven by the next deploy, not by this local process.

To run the frontend against the deployed API instead, copy `.env.example`
to `.env`, set `VITE_API_BASE_URL`, and run:

```bash
yarn dev
```

## Testing

Run all currently implemented automated checks:

```bash
yarn check
```

For the T05 local manual check:

1. Remove `hunch.session` in DevTools under Application → Local Storage.
2. Run `yarn dev:local` and open `http://localhost:5173`.
3. Confirm a player ID is shown with score 0.
4. Refresh, then close and reopen the tab. Confirm the same ID returns.
5. Open an incognito window. Confirm it receives a different ID.
6. Stop and restart `yarn dev:local`, then refresh the original tab.
7. Confirm the rejected-player message appears. Choose **Start a new
   player** and confirm a new score-0 identity appears.

For the T06 local price check, with `yarn dev:local` still running:

1. Confirm the price, **Live**, **Coinbase Exchange · BTC-USD**, and an age that counts up and resets about every 5 seconds.
2. Confirm the chart starts at **Collecting recent prices**, then draws a line. The 1-minute change waits about 60 seconds.
3. In DevTools, block the `/market` request. Within about 15 seconds the price dims, the pill says **Delayed**, and **Retry** appears. Unblock it and choose **Retry**. It returns to Live.
4. Hard-refresh while `/market` is still blocked. The pill says **Unavailable** and the page invents no price.
5. Refresh normally. The chart starts empty again.
6. Confirm the player ID and score still restore, and no Up or Down button appears.

## Deployment

The dev API and website are deployed in `eu-north-1`, stage `dev`.

- Website: `https://release.d2yczmbttcpoe9.amplifyapp.com`
- Health check: `https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health` returns `{"status":"ok"}`. That URL is public. It is not an AWS access key.

The hosted page still says **Backend connected.** and **Play is not available yet.** It shows the new player flow after the T05 API deploy and the following Amplify build.

This project account is locked to Europe (Stockholm). These steps assume an AWS account and a configured CLI. They do not create the account.

Backend, from `apps/api`:

```bash
yarn serverless package --stage dev --region eu-north-1
yarn serverless deploy --stage dev --region eu-north-1
```

Frontend: connect Amplify Hosting to this repository. Set the app root to the repository root so `amplify.yml` can build the Yarn workspace. Set `VITE_API_BASE_URL` to the API Gateway URL before the Amplify build. Add a rewrite that sends unknown paths to `/index.html` with status 200.

After Amplify has a URL, redeploy the API so the browser on that site is allowed. Until that redeploy, `curl` of `/health` can return `{"status":"ok"}` while the hosted page shows **Backend unreachable.** The browser blocks the call because the Amplify address is not on the allowed list yet. `http://localhost:5173` is the only origin allowed by the first deploy.

```bash
yarn serverless deploy --stage dev --region eu-north-1 --param amplifyOrigin=https://<amplify-host>
```

`http://localhost:5173` is already allowed, so a local `yarn dev` can call the same public API. Copy `.env.example` to `.env` and paste the API Gateway URL into `VITE_API_BASE_URL`.

To remove the dev stack later: `yarn serverless remove --stage dev --region eu-north-1`. The DynamoDB table is retained. Delete `hunch-dev` in the DynamoDB console if it should go too.

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

No account or login required. On first visit `POST /players` creates a player
at score 0 and returns a random secret token (256-bit, cryptographically random)
once. The browser saves the player id and token in `localStorage` under
`hunch.session`. The backend stores only a SHA-256 hash of that token.

On every return visit the browser sends `Authorization: Bearer <playerId>.<accessToken>`
to `GET /me`. The backend hashes the token, compares it with `timingSafeEqual`,
and restores the score. There is no active round yet, so that field is empty.
A failed restore keeps the saved session and offers retry. It does not create
a replacement player. A rejected token stays saved until you choose to start again.

Clearing browser storage loses access to that player. The DynamoDB record remains.
Another device, or a private window, creates a different player. The token is
exposed if the page has an XSS flaw. This is anonymous continuity, not an account.

## Product rationale

Prioritise clarity, fairness and reliable completion.
History supports transparency.
Optional modes test whether voluntary continuation improves engagement.

Commercial value is a hypothesis, not a demonstrated outcome.

## Known limitations

- Play is not available yet. Identity restore and the display price are in the repo. The hosted site shows them after deploy and the Amplify rebuild of `release`.
- A new prediction is not rejected for a missing entry quote yet. That check arrives with `POST /predictions`.
- Anonymous identity is browser-specific. Clearing storage or using another device loses access.
- Deploy player routes with `--param amplifyOrigin=https://release.d2yczmbttcpoe9.amplifyapp.com`, or the hosted site loses permission to call the API.
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