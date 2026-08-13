# Security Policy

Healthy Pig stores personal health information locally. Security reports are especially important when they involve:

- unintended disclosure of health records or profile data;
- cross-site scripting or another path that can read browser or WebView local storage;
- exposure, unsafe import, or unintended upload of exported backup files;
- Android WebView, JavaScript bridge, file chooser, camera, or speech integration issues;
- vulnerable dependencies or build tooling that can affect users or contributors.

## Reporting a vulnerability

Please use **GitHub Private Vulnerability Reporting** for this repository whenever it is available. Include the affected version, impact, reproduction steps, and a suggested mitigation if known. Use synthetic data only.

Do not publish exploit details, credentials, signing material, exported backups, screenshots of real health records, or other personal data in a public issue.

If private vulnerability reporting is temporarily unavailable, open a short public issue that contains no exploit, secret, or health data and asks the maintainer to provide a private communication channel. The project does not require maintainers to publish a private email address.

## Scope and response

Reports affecting the current `main` branch or a distributed Android build are in scope. Dependency-only reports should identify the reachable impact where possible. Maintainers will acknowledge and assess reports as availability permits; no fixed response or remediation time is guaranteed.
