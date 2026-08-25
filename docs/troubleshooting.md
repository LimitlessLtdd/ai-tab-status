# Troubleshooting

## The userscript is installed but the favicon stays gray

Confirm the userscript manager is enabled for the current site and reload the page.

For Claude Code Web / Remote Control, AI Tab Status currently relies on the UI markers exposed by `claude.ai/code`. Anthropic can change those markers without notice.

## Claude Code turns green too early

AI Tab Status explicitly checks for Claude Code background-task indicators before announcing completion. If a new Claude UI variant still produces an early green state, open an issue with:

- browser and version;
- userscript manager and version;
- whether you are using Claude Web or Claude Code Remote Control;
- screenshot showing the task still running;
- relevant `data-testid`, `aria-label`, or status text if available.

Do not post private prompts, repository names, credentials, tokens, or sensitive project content.

## The completion sound does not play

Modern browsers block programmatic audio before the first user interaction. Click or type once inside the ChatGPT / Claude page after loading it.

Also verify the tab/site is not muted.

## Brave / Chromium shows the original favicon

Hard-reload the page after installation. The Chromium strategy removes competing favicon declarations and reinstalls the AI Tab Status favicon if the SPA recreates its own icons.

## Firefox favicon does not update after restoring a session

Reload the restored tab once. The Firefox strategy intentionally uses presence-based detection for Claude Code's exact prompt controls because restored tabs can report unreliable element dimensions.
