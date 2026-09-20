# Upstream provenance

This is a standalone distribution of **pi-auto-save-to-markdown 0.10.2** by
Licong Yang, from [licongy/pi-claudian](https://github.com/licongy/pi-claudian).

- Source commit: `1c555c157fdfc9114200b27e52642da25a8c9ddc`
- Source directory: `packages/auto-save-to-markdown`
- License: MIT; the original copyright notice is preserved in [LICENSE](LICENSE).
- `CHANGELOG.md` records fork changes followed by the original upstream history.

Standalone changes: package name and repository metadata, installation instructions,
self-contained TypeScript configuration, development dependency lockfile, Node.js
requirement aligned with Pi 0.86.0, command labels and a local integration test.
The save algorithm, command names, environment variable and
persisted state identifiers are retained for compatibility with upstream.

Do not enable this package together with the original package in the same Pi
process: both register the same commands and save event handler.

Version 0.10.3 changes Markdown rendering: tool calls and results are omitted,
and thinking uses HTML `<details>` instead of Obsidian callouts. The append and
branch-saving behavior is retained; old Markdown content is not rewritten.

Version 0.10.4 exports only user questions and final assistant reply text,
omitting thinking and intermediate assistant updates as well as tool activity.
