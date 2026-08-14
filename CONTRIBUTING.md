# Contributing to Healthy Pig

Thank you for helping improve Healthy Pig.

## Before you start

Read [`AGENTS.md`](AGENTS.md) and [`docs/HEALTHY_PIG_BASELINE.md`](docs/HEALTHY_PIG_BASELINE.md) in full. Confirmed Web and Android features are a locked baseline and must not regress.

## Workflow

1. Fork the repository.
2. Create a focused branch from the latest `main`.
3. Install dependencies with `npm install` (use `npm ci` when reproducing CI).
4. Make a small, reviewable change.
5. Run:

   ```bash
   npm run lint
   npm test
   node --check android-apk/assets/app.js
   ```

6. Open a pull request describing the change, user impact, and validation performed.

Do not commit user health data, profile data, exported backups, `.env` files, API keys, tokens, credentials, signing keys, certificates, keystores, APKs, local databases, or hosting identity files. Use synthetic examples in tests and documentation.

Changes that alter local data structures must preserve compatibility with existing data. Web and Android behavior should be validated independently when a change can affect both.
