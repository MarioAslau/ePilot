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
- Display current score and latest available BTC/USD price.
- Predict Up or Down.
- One active prediction per player.
- Backend waits at least 60 seconds.
- Equal entry/resolution price keeps the round pending.
- Correct prediction adds 1 point.
- Incorrect prediction subtracts 1 point.
- Backend persists score and predictions.
- Browser reopening restores identity and active state.
- Backend resolution continues when the browser is closed.

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
- packages/contracts: shared schemas/types, planned.
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

The backend records an entry quote and a deadline.
After at least 60 seconds, it retrieves a fresh valid quote.

If the quote differs, the backend settles the prediction.
If equal, it waits and retries.

Movements during the first minute do not settle the prediction.
Resolution uses sampled provider data rather than guaranteeing the
first exchange trade at exactly second 60.

## Anonymous persistence

Planned:
Browser storage remembers player credentials.
DynamoDB stores authoritative score and predictions.
Step Functions runs independently of the browser.

Clearing storage loses anonymous access.
Cross-device restoration is outside the initial scope.

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

### Grill Me

User-invoked only. In a fresh Cursor chat, type `/grill-me` to start a
structured planning interview. No hooks or automatic activation.
Source: [mattpocock/skills](https://github.com/mattpocock/skills).

### Ponytail

Installed at two levels:

- **Skill** (`.cursor/skills/ponytail/SKILL.md`): attach explicitly for a
  simplification review, or invoke when relevant.
- **Hooks** (`.cursor/hooks.json`, gitignored): every new local Agent chat
  automatically receives the Ponytail ruleset at the default intensity
  (`full`). Send `/ponytail lite`, `/ponytail ultra` or `/ponytail off` as a
  plain message to change the level for that conversation.

The always-on rule file (`.cursor/rules/ponytail.mdc`) is **not installed**.
Keeping it absent is what allows the hooks to manage the level.
Subagents and cloud agents do not receive the ruleset via hooks.
Source: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

### Developer setup (hooks)

`.cursor/hooks.json` is gitignored because it contains the absolute path
of the `vendor/ponytail` checkout on each machine. After cloning, run:

```bash
git submodule update --init
node vendor/ponytail/scripts/cursor-hooks.js install --project
```

Then open a new Cursor Agent chat. Do not commit your generated
`.cursor/hooks.json`.

### Uninstall

```bash
node vendor/ponytail/scripts/uninstall.js       # remove mode flag first
node vendor/ponytail/scripts/cursor-hooks.js uninstall --project
rm -rf .cursor/skills/grill-me .cursor/skills/ponytail
git submodule deinit -f vendor/ponytail && git rm vendor/ponytail
rm -rf .git/modules/vendor/ponytail
# restore .gitignore: remove the .cursor/hooks.json line
```

## Screenshots

Add screenshots of implemented functionality before submission.