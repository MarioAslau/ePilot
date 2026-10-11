# BTC Prediction Game

An epilot coding assignment: predict whether BTC/USD will be higher
or lower after at least one minute.

## Implementation status

T00 through T11 are complete. T12 Momentum Double Down is implemented locally and awaiting a manual check. The hosted site at `https://release.d2yczmbttcpoe9.amplifyapp.com` calls the deployed API and does not include history or Double Down until the next API deploy and Amplify rebuild. A deploy leaves Double Down off unless it passes `--param doubleDown=on`. On 2026-10-11 a hosted Up round was still running when the tab was closed, and after 5 minutes it had settled as a loss. The fuller pass before submission is the T14 section of `docs/implementation-plan.md`.

## Links

- Deployed application: https://release.d2yczmbttcpoe9.amplifyapp.com
- Health check: https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health
- Public repository: https://github.com/MarioAslau/ePilot

## Standard functionality

Implemented:
- Anonymous player starts with score 0.
- The browser restores that player and shows the server score.
- The page shows the latest validated BTC-USD price, its source, its age, and a chart collected on this page.
- Predict Up or Down. The server records the entry price and a 60-second deadline.
- One active prediction per player, enforced by the backend.
- After 60 seconds the server compares a fresh Coinbase trade with the entry price. A win adds 1. A loss subtracts 1. An equal price or a price-source failure stays pending and is not a loss.
- The page shows that result and then offers Up and Down again.
- After the first settled round, the score card shows wins, losses, and accuracy for all settled rounds.
- Settled rounds are listed for that player, 20 at a time, up to 50 per request. The list shows direction, both prices, the point change, and the trade times. Pending rounds stay on the ticket, not in the list.

## Optional features

Planned after the verified MVP:
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

Open `http://localhost:5173`. The local API runs the player, market, and
prediction handlers in memory. `GET /api/market` calls the public Coinbase
BTC-USD ticker, and so does an Up or Down click. Records do not need AWS
credentials, a deployment, or DynamoDB.

A development-only fault switch is available while this command is running.
It is not part of the deployed API.

```bash
curl -X POST http://localhost:5173/api/__dev/next-prediction \
  -H 'Content-Type: application/json' \
  -d '{"mode":"provider-down"}'
```

`provider-down` makes the next prediction quote fail. `drop-response`
records the next prediction and then drops the HTTP response.
`equal-price` makes the next resolution quote use the entry price.
`resolution-provider-down` fails the next two resolution quotes.
Restarting the command clears in-memory rounds. There is no cancel button.
To leave a locked local round behind, choose **Start a new player** in a new
browser profile, or restart `yarn dev:local` and start again.

After deploy, a round that is still pending can be unlocked by deleting its
`PREDICTION#` item and removing `activePredictionId`. Do that only when no
workflow is about to settle it. Idempotency items expire after 24 hours.
Do not add a reset control to the game.

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
6. Confirm the player ID and score still restore. On the current build a Live price also shows Up and Down. That is the T07 behaviour below.

For the T07 local prediction check, restart `yarn dev:local` and use a new player:

1. With a Live price, choose **Up**. Both buttons lock, then a ticket shows the server entry price, the trade time, and a countdown. The buttons disappear.
2. Refresh the tab. The same ticket returns. The score stays 0.
3. Double-click **Up** on a new player. One ticket appears.
4. Open the same player in a second tab after the first tab has a ticket. The second tab shows that same round immediately, and its buttons are gone.
5. `curl -X POST http://localhost:5173/api/__dev/next-prediction -H 'Content-Type: application/json' -d '{"mode":"drop-response"}'`, then choose **Down**. The page says it is checking whether the prediction was recorded, then shows the ticket.
6. Arm `{"mode":"provider-down"}` and choose a direction on a player with no round. The page says **Not placed. The price source is unavailable.** and the buttons return.
7. Wait until the countdown reaches 0. On the T07 build the ticket said **Checking price** and did not settle. Mario confirmed that local check on 2026-10-11.

For the T08 local check, restart `yarn dev:local` and start a new player. Each round takes the real minute.

1. Choose **Up**. After the countdown the receipt says **Correct** or **Not this time**, the point change, both prices, and both trade times. The header score changes once. Up and Down return.
2. `curl -X POST http://localhost:5173/api/__dev/next-prediction -H 'Content-Type: application/json' -d '{"mode":"equal-price"}'`, then place a round. After 60 seconds the ticket says the price still equals the entry and stays amber. The next check can settle it.
3. Arm `{"mode":"resolution-provider-down"}` and place a round. The ticket says the price source is unavailable and the score does not drop. It then settles.

Deployed, only after that local check is confirmed:

4. From `apps/api`, deploy with `--param amplifyOrigin=https://release.d2yczmbttcpoe9.amplifyapp.com --param alarmEmail=<your email>`. Adding the index can take several minutes. Confirm the SNS email. Push the frontend to `release`.
5. Place a round, close the browser, and reopen after more than 90 seconds. The receipt and the new score are there. The player item has no `activePredictionId`.
6. In Step Functions, execution `prediction-<id>` shows Wait, then Resolve, then Succeed, at or after `dueAt`.
7. Starting that same execution name again does not create a second score change.
8. Stop the execution, wait for the scanner after `dueAt` plus about 7 minutes, and confirm one `prediction-<id>-r…` execution settles the round once.
9. Place a second round with the same player.

For the T09 local check, restart `yarn dev:local` and start a new player. `http://localhost:5173/?fixture=win` and `?fixture=loss` show the two receipts without waiting. A real round still takes the minute. Near the end, `/me` polls about every second. At 0 the ticket says Comparing prices. The score flashes once. Refreshing the receipt does not flash again. `equal-price` and `resolution-provider-down` still use the fault switch above. The hold ticket is amber and says an outage never counts as a loss. If the market request is blocked, Up and Down stay visible and disabled, with “Waiting for a live price”.

For the T11 local check, restart `yarn dev:local` and start a new player. Your rounds is empty before the first result. After a settled round, the row appears without a refresh and is still there after a reload. `http://localhost:5173/?fixture=history` and `?fixture=history-empty` show the list and the empty copy without waiting. Accuracy says all settled rounds. A page holds 20 rounds. Load older rounds appears only when another page exists. The hosted site still shows the placeholder until the API and the Amplify app are deployed again.

For the T12 local check, `yarn dev:local` turns Double Down on. Set `FEATURE_DOUBLE_DOWN=off` before that command to hide it. Arm the next settlement as a win, then place a round:

```bash
curl -X POST http://localhost:5173/api/__dev/next-prediction \
  -H 'Content-Type: application/json' \
  -d '{"mode":"next-resolution-win"}'
```

That fault is local only. It is not on API Gateway. After the receipt, the offer shows +1 kept, the same direction, +2 for a pair total of +3, and −2 for a pair total of −1. Need more time adds 20 seconds, up to 10 times. The offer ends after the deadline. No thanks keeps the +1. Up or Down while it is open starts a normal round and ends the offer. A bonus win does not offer another bonus. `http://localhost:5173/?fixture=dd-offer` shows the offer without waiting. The other `dd-` names are in the preview banner. Hosted checks wait for a deploy with `--param doubleDown=on`.

## Deployment

The dev API and website are deployed in `eu-north-1`, stage `dev`.

- Website: `https://release.d2yczmbttcpoe9.amplifyapp.com`
- Health check: `https://6n3p7430tg.execute-api.eu-north-1.amazonaws.com/health` returns `{"status":"ok"}`. That URL is public. It is not an AWS access key.

The hosted page is the game. It records an Up or Down prediction and the API settles it after the minute, including when the tab is closed.

This project account is locked to Europe (Stockholm). These steps assume an AWS account and a configured CLI. They do not create the account.

Backend, from `apps/api`:

```bash
yarn serverless package --stage dev --region eu-north-1
yarn serverless deploy --stage dev --region eu-north-1
```

Frontend: connect Amplify Hosting to this repository. Set the app root to the repository root so `amplify.yml` can build the Yarn workspace. Set `VITE_API_BASE_URL` to the API Gateway URL before the Amplify build. Add a rewrite that sends unknown paths to `/index.html` with status 200.

After Amplify has a URL, redeploy the API so the browser on that site is allowed. Until that redeploy, `curl` of `/health` can return `{"status":"ok"}` while the hosted page shows **Backend unreachable.** The browser blocks the call because the Amplify address is not on the allowed list yet. `http://localhost:5173` is the only origin allowed by the first deploy.

```bash
yarn serverless deploy --stage dev --region eu-north-1 --param amplifyOrigin=https://<amplify-host> --param alarmEmail=<email>
```

`alarmEmail` creates an email subscription on topic `hunch-<stage>-alerts`. Leave it out and `serverless package` still works; the topic exists and has no email. Confirm the subscription email after deploy or the resolution alarms have no recipient. T10 still reviews the wider alarm set.

`http://localhost:5173` is already allowed, so a local `yarn dev` can call the same public API. Copy `.env.example` to `.env` and paste the API Gateway URL into `VITE_API_BASE_URL`.

To remove the dev stack later: `yarn serverless remove --stage dev --region eu-north-1`. The DynamoDB table is retained. Delete `hunch-dev` in the DynamoDB console if it should go too.

## How resolution works

When a prediction is accepted, the backend records an entry quote and a
deadline at least 60 seconds later, then starts a workflow named
`prediction-{predictionId}`. The workflow waits until that deadline and
fetches a fresh Coinbase trade. It does not use the display-price cache.

If the trade price differs, one transaction records the result and changes
the score by 1. If the price is equal, it waits 5 seconds and tries again.
If the price source fails, or the trade is older than 10 seconds, it waits
15 seconds and tries again. That is not a loss. The receipt shows both
prices, both trade times, when the quote was fetched, and when it was settled.

Movements during the first minute do not settle the prediction.
If the workflow fails to start, the scanner looks every 5 minutes for
rounds more than 2 minutes past their deadline. A missing execution uses
the original name. A finished failure uses a new name, because Step
Functions keeps a completed name for 90 days. The worst case is about
7 minutes after the deadline. The local `yarn dev:local` loop does the
same wait and the same comparison without calling AWS. Closing the browser
does not stop it while that process is running. On AWS, closing the
browser does not stop the Step Functions execution.

## Anonymous persistence

No account or login required. On first visit `POST /players` creates a player
at score 0 and returns a random secret token (256-bit, cryptographically random)
once. The browser saves the player id and token in `localStorage` under
`hunch.session`. The backend stores only a SHA-256 hash of that token.

On every return visit the browser sends `Authorization: Bearer <playerId>.<accessToken>`
to `GET /me`. The backend hashes the token, compares it with `timingSafeEqual`,
and restores the score, any active round, and the latest settled result.
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

- The hosted site settles rounds after the real minute. Closing the tab does not cancel that round.
- A round whose workflow never starts can stay pending until about 7 minutes after the deadline. An execution gives up after 6 hours, and the scanner starts another one.
- There is no in-app cancel.
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