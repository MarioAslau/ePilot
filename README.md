# Hunch — BTC/USD higher or lower

A small web game built for the epilot coding assignment. You guess whether the Bitcoin price (BTC/USD) will be higher or lower after at least one minute. The server records your entry price, waits, compares prices fairly and keeps your score, even if you close the browser.

- **Play it:** https://release.d2yczmbttcpoe9.amplifyapp.com
- **Repository:** https://github.com/MarioAslau/ePilot
- **API health check:** https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health
- **More detail:** [architecture and decisions](docs/architecture.md) · [ticket plan and diary](docs/implementation-plan.md)

> **Hosted build pending redeploy with both optional modes on.** Delete this line after the deploy in [Deploy your own copy](#deploy-your-own-copy) has been run with `--param doubleDown=on --param redemption=on` and checked.

## Brief requirements

| Requirement from the brief | How it is met |
|---|---|
| The player always sees their current score and the latest BTC/USD price | The header and score card show the server score from `GET /me`. The market card polls `GET /market` (Coinbase Exchange BTC-USD ticker) about every 5 seconds and shows its age, with Live / Delayed / Unavailable. |
| The player can guess "up" or "down" | Up and Down buttons call `POST /predictions`. The server fetches its own entry price at that moment; it never trusts a price sent by the browser. |
| No new guess until the current one is resolved; one guess at a time | A DynamoDB transaction sets `activePredictionId` on the player only when it is empty. Two tabs or a double click cannot open a second round (`409 ACTIVE_ROUND`). The buttons stay locked in the UI as well. |
| Resolved when the price has changed **and** at least 60 seconds have passed | A Step Functions workflow waits until the stored deadline (entry + 60 s), then compares a fresh Coinbase trade with the entry price. If the price is equal, it waits 5 seconds and checks again. The compared trade's exchange timestamp must itself be at least 60 s after the entry. |
| Correct +1, incorrect −1 | `evaluate()` in `packages/contracts/src/evaluator.ts` compares decimal strings exactly (no floating point). Settlement adds the result to the score in one conditional transaction, so it can only happen once. |
| New players start at 0 | `POST /players` creates an anonymous player with score 0. |
| Resolved fairly with third-party price data | Coinbase Exchange public BTC-USD ticker. Responses are validated, requests time out after 3 s, and a quote older than 10 s is not used. If the provider fails, the round waits; an outage never counts as a loss. Each receipt shows both prices and both trade times. |
| Score persisted in a backend store (AWS preferred) | Amazon DynamoDB, written by AWS Lambda behind API Gateway. |
| Link to the deployed solution | https://release.d2yczmbttcpoe9.amplifyapp.com (AWS Amplify Hosting + the API in `eu-north-1`). |
| Optional: close the browser and come back | The browser keeps an anonymous id and secret token in `localStorage`. On return, `GET /me` restores the score, any running round and the latest result. Rounds keep resolving on the server while the browser is closed. |
| Testing encouraged | Unit, handler, component, DynamoDB integration and Playwright browser tests, run in GitHub Actions. See [Tests](#tests). |

## How to play

1. Open the site. You get an anonymous player at score 0. There is no sign-up.
2. Watch the live price and chart, then press **Up** or **Down**.
3. The server locks a fresh entry price and starts a 60-second minimum wait. Moves during that minute do not count.
4. When the countdown ends, the round shows **Comparing prices** until the server confirms a result.
5. The receipt shows **Correct** or **Not this time**, the point change, the entry and compared prices, and the trade times. Your score updates once.
6. Your settled rounds are listed under **Your rounds**. Close the tab at any time: the round still settles, and your score is there when you come back in the same browser.

Two optional extras are switched on in the hosted build (see [Optional modes](#optional-modes)).

## Screenshots

Captured from the hosted site.

| | |
|---|---|
| ![Ready to play: price, chart, score and Up/Down](docs/screenshots/ready.png) | ![A running round with the 60-second countdown](docs/screenshots/active.png) |
| Ready to play | A running round |
| ![Result receipt with entry and compared prices](docs/screenshots/result.png) | ![Your rounds history list](docs/screenshots/history.png) |
| Result receipt | History |

![Mobile layout at 375px](docs/screenshots/mobile.png)

## How it works

```
Browser (React, AWS Amplify Hosting)
   │  polls GET /market (~5 s) and GET /me (1–3 s)
   ▼
API Gateway HTTP API ──► Lambda handlers ──► DynamoDB (players, rounds, offers)
                              │
          POST /predictions   │  1. fetch a fresh Coinbase entry price
                              │  2. one transaction: save round + lock player
                              │  3. start a Step Functions execution
                              ▼
                 Step Functions Standard: wait until deadline
                              │
                              ▼
                 Resolver Lambda: fresh Coinbase trade
                   · equal price      → wait 5 s, try again
                   · provider failure → wait 15 s, try again (never a loss)
                   · differs          → one transaction: result + score + unlock

EventBridge schedule (every 5 min) ──► recovery Lambda restarts any round whose workflow is missing
```

**Fairness.** The server owns every price and timestamp. The browser's displayed price is only for display. The entry is the Coinbase trade fetched when the guess is accepted. The result uses the first fresh trade after the deadline whose price differs from the entry. Prices are compared as exact decimal strings, so display rounding can never decide a result.

**Reliability.**
- One active round per player is enforced by a DynamoDB transaction condition, not by application code.
- Each guess carries a browser-generated idempotency key, so retrying a lost request returns the same round instead of creating a second one.
- Settlement is conditional: a duplicate or recovered execution cannot change the score twice.
- CloudWatch alarms cover failed or timed-out executions, Lambda errors and a failed workflow start.

**Identity.** There are no accounts. `POST /players` returns a random 256-bit token once. The server stores only its SHA-256 hash and compares hashes with `timingSafeEqual`.

The full design, data model, API contract, runbook and decision log (D1–D8) are in [docs/architecture.md](docs/architecture.md).

### Stack

React, TypeScript, Vite, Tailwind CSS, TanStack Query, Zod · AWS Lambda (TypeScript), API Gateway HTTP API, DynamoDB, Step Functions, EventBridge, CloudWatch, SNS · Serverless Framework v4 · AWS Amplify Hosting · Vitest, React Testing Library, Playwright · GitHub Actions.

## Optional modes

These go beyond the brief. Each is behind its own deploy flag, off by default, and both are on in the hosted build. Standard rounds always score +1 / −1.

- **Momentum Double Down.** After a standard win, you may play one bonus round in the **same direction**: +2 if right, −2 if wrong. The original +1 is kept, so the pair totals +3 or −1.
- **Redemption.** After a standard loss, you may play one round in a **direction you choose**: +4 if right, −2 if wrong. The original −1 stands, so the pair totals +3 or −3.

Both offers last 10 seconds. **Need more time?** adds 20 seconds, up to 10 times, for accessibility. A follow-on round never creates another offer. Starting a normal round, declining or letting the offer expire ends it. A follow-on round still waits at least 60 seconds and settles the same way as a standard round.

Redemption's +4/−2 comes from the ticket. At roughly even odds, accepting is worth about +1 point on average, so declining is never the better score. That trade-off is recorded as decision D8.

## Run locally

**Prerequisites:** Node.js 20 or newer (built with 20.20), Yarn Classic 1.22 (`npm install -g yarn`, or `corepack enable`), and Git. **No AWS account is needed to run the game locally.**

```bash
git clone https://github.com/MarioAslau/ePilot.git
cd ePilot
yarn install
yarn dev:local
```

Open http://localhost:5173.

`yarn dev:local` runs the real API handlers in memory inside the Vite dev server:
- prices come from the real Coinbase ticker
- rounds take the real 60 seconds and settle automatically
- both optional modes are on (set `FEATURE_DOUBLE_DOWN=off` or `FEATURE_REDEMPTION=off` before the command to hide one)
- players and scores are lost when the command stops; the browser then says its saved player was rejected, and **Start a new player** fixes it

To run the frontend against a deployed API instead, copy `.env.example` to `.env`, set `VITE_API_BASE_URL` to the API Gateway URL, and run `yarn dev`.

### Previews without waiting

In development, `?fixture=<name>` renders a single screen with fixed data, using the real components. Examples:
- http://localhost:5173/?fixture=win
- `?fixture=loss`, `?fixture=history`, `?fixture=dd-offer`, `?fixture=rd-offer`

The banner on a fixture page lists every name. Fixtures are not included in the production build.

### Local fault switch

While `yarn dev:local` runs, you can arm a fault for the next request to see the failure states. This route exists only in the local dev server, never on API Gateway.

```bash
curl -X POST http://localhost:5173/api/__dev/next-prediction \
  -H 'Content-Type: application/json' \
  -d '{"mode":"equal-price"}'
```

| Mode | Effect on the next round |
|---|---|
| `provider-down` | The entry price fetch fails, so the guess is not placed and the score is unchanged. |
| `drop-response` | The guess is saved but the HTTP response is dropped. The page retries with the same key and shows the one round. |
| `equal-price` | The first resolution check sees the entry price, so the round stays pending and checks again. |
| `resolution-provider-down` | The first two resolution checks fail. The round is held, not lost, then settles. |
| `next-resolution-win` | The round resolves as a win (shows the Double Down offer). |
| `next-resolution-loss` | The round resolves as a loss (shows the Redemption offer). |

## Tests

```bash
yarn check
```

`yarn check` runs typecheck, lint, all unit and component tests, and the production build across the three workspaces:
- `packages/contracts`: schemas and the decimal-safe `evaluate()` scoring rules (60-second rule, equal price, ±1)
- `apps/api`: handler tests with injected clocks and price quotes: identity and token hashing, prediction creation and idempotency, resolution and settlement, recovery scanner, history, offers, and a check that logs never contain tokens
- `apps/web`: React Testing Library tests for loading, stale price, active round, holds, results, history and offers, and pure tests for countdown and polling logic

**Browser journey (Playwright).** It uses a mocked API and a simulated clock, so it runs in seconds:

```bash
yarn workspace web exec playwright install chromium   # first time only
yarn workspace web e2e
```

**Real DynamoDB conditions.** These tests run the real transactions: two concurrent creates leave one round, a settlement that runs twice changes the score once, and an offer accept racing a normal round leaves one round. They need DynamoDB Local (Docker) and are skipped when `DYNAMODB_ENDPOINT` is not set:

```bash
docker run --rm -p 8000:8000 amazon/dynamodb-local
DYNAMODB_ENDPOINT=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-north-1 \
  yarn workspace api test:int
```

**CI.** `.github/workflows/ci.yml` runs three jobs on every push and pull request:
1. `check`, which also confirms dev-only code is absent from the production bundle
2. `dynamo`, the DynamoDB Local race tests
3. `e2e`, the Playwright journey

The full manual checklist used before release, including deployed checks, is the **Final manual test** section of [docs/implementation-plan.md](docs/implementation-plan.md).

## Deploy your own copy

### Prerequisites

- An AWS account and the AWS CLI configured with a non-root IAM user (`aws sts get-caller-identity` should work).
- Serverless Framework v4 login. It is installed as a dev dependency. Run `yarn serverless login` from `apps/api` once, or set `SERVERLESS_ACCESS_KEY`.
- A fork of this repository, for AWS Amplify Hosting.

### 1. Backend

From `apps/api`:

```bash
cd apps/api
yarn serverless deploy --stage dev --region eu-north-1 \
  --param amplifyOrigin=https://<your-amplify-domain> \
  --param alarmEmail=<you@example.com> \
  --param doubleDown=on \
  --param redemption=on
```

The default region is `eu-north-1`; pass `--region` to use another. The output prints the API URL (`https://<id>.execute-api.<region>.amazonaws.com`). It creates:
- the DynamoDB table `hunch-<stage>`
- the Lambdas
- the HTTP API
- the state machine `hunch-<stage>-resolution`
- the 5-minute recovery schedule
- the alarms and SNS topic

| Param | Default | Purpose |
|---|---|---|
| `amplifyOrigin` | `http://localhost:5173` | Website origin allowed by CORS. `http://localhost:5173` is always allowed. |
| `alarmEmail` | none | Email subscription for alarms. Confirm the email AWS sends, or alarms have no recipient. |
| `doubleDown` | `off` | `on` enables Momentum Double Down. |
| `redemption` | `off` | `on` enables Redemption. |

`yarn serverless package --stage dev --region eu-north-1` builds and validates the template without deploying.

### 2. Frontend (AWS Amplify Hosting)

1. In the Amplify console, create an app from your fork and branch.
2. Keep the app root at the repository root. `amplify.yml` builds the Yarn workspace and publishes `apps/web/dist`. If Amplify asks for a monorepo root, use `.` (`AMPLIFY_MONOREPO_APP_ROOT=.`).
3. Add the environment variable `VITE_API_BASE_URL` = the API URL from step 1 (no trailing slash).
4. Add the single-page-app rewrite (Hosting → Rewrites and redirects): source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
5. Build. Amplify gives you `https://<branch>.<id>.amplifyapp.com`.

### 3. Allow the website origin

If the Amplify domain was not known in step 1, redeploy the backend with `--param amplifyOrigin=https://<your-amplify-domain>`. Without it, `/health` still answers `curl`, but the browser blocks the calls and the page shows **Backend unreachable**.

### 4. Check it

```bash
curl https://<api-id>.execute-api.<region>.amazonaws.com/health   # {"status":"ok"}
```

Open the site, play a round, close the tab, reopen it after a minute and confirm the result and score are there.

### Remove it

```bash
cd apps/api
yarn serverless remove --stage dev --region eu-north-1
```

The DynamoDB table is retained on purpose. Delete `hunch-dev` in the DynamoDB console if you no longer need the data.

**Cost.** Everything is pay-per-use: on-demand DynamoDB, Lambda, Step Functions Standard (a few state transitions per round), and 14-day log retention. Light use stays within free-tier or near-zero cost.

## Configuration

| Name | Where | Default | Meaning |
|---|---|---|---|
| `VITE_API_BASE_URL` | frontend build (`.env` locally, Amplify env var) | empty | API Gateway URL. `yarn dev:local` sets it to `/api` automatically. |
| `amplifyOrigin` | deploy param | `http://localhost:5173` | Allowed browser origin (CORS). |
| `alarmEmail` | deploy param | none | Alarm email subscription. |
| `doubleDown` → `FEATURE_DOUBLE_DOWN` | deploy param → Lambda env | `off` | Momentum Double Down. Locally on unless set to `off`. |
| `redemption` → `FEATURE_REDEMPTION` | deploy param → Lambda env | `off` | Redemption. Locally on unless set to `off`. |
| `TABLE_NAME` | Lambda env (set by the template) | `hunch-<stage>` | DynamoDB table. |

No secrets are needed in the repository. Never commit AWS credentials. The player token lives only in the player's browser.

## Repository structure

```
apps/web             React frontend (Vite); local in-memory API wired in vite.config.ts
apps/api             Lambda handlers, DynamoDB stores, serverless.yml
  src/workflow       Step Functions definition (resolution.asl)
  src/integration    DynamoDB Local race tests
packages/contracts   Shared Zod schemas and types, evaluate() scoring rules
docs/                architecture.md, implementation-plan.md, design/
.github/workflows    CI
```

## Known limitations and trade-offs

- **Anonymous, per-browser identity.** Clearing browser storage or switching device starts a new player; the old score stays on the server but cannot be reopened. A token in `localStorage` is exposed if the page ever had an XSS flaw.
- **Polling, not WebSockets.** It is simpler and enough for one-minute rounds. Results appear within about 1–3 seconds of settlement.
- **The compared trade can be a few seconds after the deadline.** The resolver checks shortly after the deadline and uses the first valid differing trade, not the exact trade at second 60.
- **Recovery is not instant.** If a round's workflow fails to start, the scheduled scanner restarts it, which can take up to about 7 minutes after the deadline. No score is lost or doubled.
- **No in-app cancel** for a running round.
- **Public, unauthenticated `/market` and `/health`.** Cost abuse is an accepted risk at this scale.
- **Redemption favours accepting** (see [Optional modes](#optional-modes)).
- **One stage and region** (`dev`, `eu-north-1`). Lambdas use `nodejs20.x`, which AWS stops accepting for new functions on 2027-02-01.

## How this was built (AI assistance)

The work was split into tickets T00–T14 in [docs/implementation-plan.md](docs/implementation-plan.md). Each ticket was planned, implemented, checked and manually verified before the next began. The diary records the checks run and what was verified by hand.

AI coding assistants (Claude and Cursor) were used for planning, implementation and review. Every change was reviewed and verified by the author, and architecture decisions were agreed explicitly and recorded in the decision log.

Two project skills supported that process:
- **Grill Me** (`.cursor/skills/grill-me`): a structured, one-question-at-a-time architecture review, used before writing application code.
- **Ponytail** (`.cursor/skills/ponytail`, source in `vendor/ponytail`): pushes for the simplest working solution during coding and review. Its Cursor hooks in `.cursor/hooks.json` contain machine-specific paths; re-run its install script from `vendor/ponytail/` on another machine.
