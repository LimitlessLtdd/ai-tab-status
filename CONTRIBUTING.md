# Contributing

Contributions are welcome, especially fixes for UI changes in ChatGPT and Claude.

## Before opening a pull request

- Keep the userscript dependency-free.
- Do not add analytics, telemetry, or external network calls.
- Never modify the tab title.
- Preserve Firefox and Chromium/Brave behavior.
- Avoid broad text matching when a stable DOM marker is available.
- For Claude Code, do not treat an intermediate response as completion while background tasks remain active.
- Run `node --check src/ai-tab-status.user.js`.

## Bug reports

Include the browser, userscript manager, affected AI interface, expected state, actual state, and a minimal DOM marker or sanitized screenshot when possible.

Never include private prompts, credentials, tokens, proprietary source code, or sensitive repository information.
