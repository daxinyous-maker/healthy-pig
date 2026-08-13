# Healthy Pig / 健康小猪

Healthy Pig is a privacy-first, local-first personal health and habit tracker for Web and Android. It helps people record daily health routines, review trends, and maintain flexible plans without sending health records to an application server by default.

健康小猪是一款强调隐私和本地存储的个人健康与习惯记录工具，提供网页端和离线 Android 端。健康记录、个人资料、计划、目标与习惯默认保存在当前设备。

> **Important:** This project is a personal health tracking tool and is not medical advice or a medical device.

## Why local-first?

Health notes can be deeply personal. Healthy Pig keeps its primary data model in browser or Android WebView local storage instead of requiring an account-backed health database. The app does not upload health records to a Healthy Pig server by default. Users decide when to export a local JSON backup and where to store it.

Local-first does not mean risk-free: anyone with access to the device, browser profile, exported backup, or a vulnerable page context may be able to read local data. See [Security](#security) and [SECURITY.md](SECURITY.md).

## Current features

### Health records and custom habits

- Sleep, meals, exercise, and water tracking.
- Meal descriptions and portions with a local estimated calorie value; users are not required to enter calories directly.
- Optional smoking and alcohol habits.
- Custom habits with completion, count, duration, rating, text, or numeric record types.
- Positive and negative goal directions, such as “more water is better” and “less smoking is better.”
- Editable record timestamps, notes, history, and deletion.
- Drag-to-reorder frequently used habits.

### Natural-language and voice input

- One paragraph can be parsed into multiple records for built-in and custom habits.
- Common Chinese date and time expressions such as “昨晚”, “昨天”, “午饭”, and “下午 3 点” are supported by the current local parser.
- Parsed results can be reviewed and edited before saving.
- Browser speech-to-text is used when supported, with a clear text-input fallback.
- The Android app uses the platform speech recognition flow and stores results locally.

Natural-language parsing and meal estimates are convenience features, not clinical calculations.

### Trends

- 7-day, 30-day, and 3-month views.
- Curved trend charts; the 3-month view groups roughly every three days into one point.
- Per-item detail views, goal lines, daily notes, and gentle streak summaries.
- Negative-direction habits explicitly treat a downward trend as improvement.
- Newly created habits appear in trends automatically.

### Plans

- Create, edit, delete, and complete plans.
- Daily, weekdays, weekends, and one-time recurrence options.
- Completion is stored by date so a recurring plan starts fresh each applicable day.

### Local backup and restore

- Export the current local data as a JSON backup.
- Restore a backup only after explicit confirmation.
- Backups are not uploaded by the app, but the exported file contains personal data and must be protected by the user.

## Web and Android

- **Web:** a Next.js-compatible vinext application with desktop side navigation and mobile bottom navigation.
- **Android:** a small offline WebView wrapper in [`android-apk/`](android-apk/) with native photo selection/camera and speech recognition integration.
- Web and Android are separate deliverables and both implement the confirmed Healthy Pig feature baseline.

## Privacy design

- Health records, profile fields, plans, goals, and habits stay on the current device by default.
- The active product has no health-record API route and no D1/Drizzle health database.
- Local storage versions are migrated compatibly so updates do not intentionally erase existing records.
- Android updates should be installed over the existing app. Uninstalling the app clears Android app data.
- `.env` files, hosting identity, signing material, APKs, databases, and health backup files are ignored by Git.

## Installation and development

### Requirements

- Node.js 22 (the package requires Node.js `>=22.13.0`)
- npm

### Web

```bash
git clone https://github.com/daxinyous-maker/healthy-pig.git
cd healthy-pig
npm ci
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
node --check android-apk/assets/app.js
```

`npm test` performs a production build before running regression tests. Local hosting metadata may exist at `.openai/hosting.json`, but it is intentionally not committed and is not required for the public repository tests.

### Android

The Android build requires JDK 21 and Android SDK 36. Follow [`android-apk/README.md`](android-apk/README.md). Signing passwords and keystores must remain local and must never be committed.

## Project structure

```text
app/                    Web UI, local state, and styles
android-apk/            Offline Android WebView app and build script
build/                  vinext/Sites build helper
docs/                   Confirmed feature baseline
public/                 App icons and social image
tests/                  Build and regression tests
worker/                 Cloudflare-compatible vinext entry point
.github/                CI and dependency update configuration
```

## Roadmap

- Improve accessibility and keyboard/screen-reader coverage.
- Expand test coverage for backup migrations and local-storage edge cases.
- Improve the transparency and configurability of local meal estimates.
- Review WebView and browser storage hardening options without introducing health-data cloud storage.
- Add contributor-friendly Android build and test automation where signing is not required.

Roadmap items are intentions, not promises or currently available features.

## Security

Please do not disclose vulnerabilities, exploit details, secrets, or health data in a public issue. Use GitHub Private Vulnerability Reporting when available and follow [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the project guardrails in [AGENTS.md](AGENTS.md) and [`docs/HEALTHY_PIG_BASELINE.md`](docs/HEALTHY_PIG_BASELINE.md) before changing behavior. Confirmed features must not regress.

## License

Healthy Pig is available under the [MIT License](LICENSE).
