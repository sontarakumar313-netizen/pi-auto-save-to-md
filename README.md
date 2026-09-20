# pi-auto-save-to-md

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](README.md) | [中文](README.zh.md)

A standalone distribution of Licong Yang's `pi-auto-save-to-markdown 0.10.2`,
under the original MIT license. See [UPSTREAM.md](UPSTREAM.md) for provenance.
The extension writes session records directly after each completed turn while
terminal output continues normally; no model file-writing calls are needed.

A [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extension that automatically saves every completed conversation turn as a markdown file with YAML frontmatter — one file per session-tree branch.

## Why

Pi records sessions internally as JSONL trees, which are great for resuming but terrible for reading, searching, or archiving. This extension mirrors the conversation into plain markdown files as you work, so every exchange is preserved in a format any editor, note app, or grep can consume — with the model, cost, tokens, and session metadata right in the frontmatter.

## Installation

```
pi install https://github.com/sontarakumar313-netizen/pi-auto-save-to-md
```

Requires Node.js 22.19.0+ and Pi 0.82.0+; validated with Pi 0.86.0. Restart Pi or
run `/reload` after installation. For project-only installation, run
`pi install -l C:/Users/Wu/Desktop/WorkTemp/pi-auto-save-to-md` from that project.
For a temporary session, run
`pi -e C:/Users/Wu/Desktop/WorkTemp/pi-auto-save-to-md/index.ts`.
Do not enable the original package alongside this fork: both register the same
commands and save handler.

## Development

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run
```

Tests use local Pi sessions and synthetic messages without model API calls.

## Usage

Automatic: after every settled agent turn (`agent_settled`), the current conversation branch is written to `<cwd>/<folder>/<title>-<key>-<time>.md`.

Sessions Pi does not persist (in-memory, `--no-session` — including the ephemeral auxiliary agents host clients spawn next to the real conversation, such as Claudian's title generation) are skipped by every automatic save; only the explicit `/save-conversation` command archives such a session on demand.

Manual: run `/save-conversation` to save the current branch immediately and report the file path.

Batch: run `/save-conversation-all` to save **every session of the current project** — every session jsonl in the project's `~/.pi/agent/sessions/<encoded-cwd>/` folder. Each session goes through the exact same pipeline as the live one (candidate chain, never-overwrite guard, rename-on-title, recovery warnings), and its archive is written under that session's own working directory, exactly as if `/save-conversation` had been run inside it. The current session saves first through the normal live path. Details:

- **Idempotent.** Re-running continues or reports "up to date" per session; it never re-creates files.
- **Skips** sessions without an assistant reply (nothing conversational to archive) and pre-`id/parentId`-era legacy files.
- **Defers** a session whose jsonl changed while it was being processed (its runtime is still writing it): the save only proceeds when the file is verified unchanged since it was read. Deferred sessions are continued by their own runtime or by the next batch run.
- **Reports** a summary — `N saved, M up to date, K skipped, …` — with per-session warnings for anything anomalous (each tagged with the first 8 chars of its session id).

## Codex fast mode

When signed in with ChatGPT through Pi's `openai-codex` provider, use
`/codex-fast on`, `/codex-fast off`, or `/codex-fast status` (also the default
when no argument is supplied). Fast mode is off for new sessions.

When enabled, subsequent `openai-codex` requests include `service_tier: "priority"`.
Reasoning effort stays unchanged, and other providers are unaffected. The setting
is stored in the current session branch and restored on restart, `/reload`, or
tree navigation. The footer shows `Codex fast: on`, or `inactive` on other
providers. Turning it off stops adding the priority parameter. Requests already
in progress are unaffected.

Fast mode can consume more account usage. Availability depends on the account,
model, and server; the footer indicates the requested mode, not confirmed priority
processing. Pi reports provider errors normally. See the official
[Codex speed guide](https://learn.chatgpt.com/docs/agent-configuration/speed) and
[Fast request parameter](https://developers.openai.com/api/docs/guides/fast-mode).

## Configuration

The target folder is controlled by the `PI_SAVE_CONVERSATION_DIR` environment variable (Pi has no per-extension settings API):

| Value       | Location                            |
| ----------- | ----------------------------------- |
| unset       | `<cwd>/ai-conversations/` (default) |
| `.` or `""` | `<cwd>/` directly                   |
| `notes/ai`  | `<cwd>/notes/ai/`                   |
| `/abs/path` | that absolute path                  |

```bash
PI_SAVE_CONVERSATION_DIR=notes/ai pi
```

## File naming and frontmatter

Filename: `<title>-<key>-<time>.md`

- `<title>` — the session name (`/name`), or a slug of the first user message when the session is unnamed
- `<key>` — the first 8 hex of the SHA-256 of the session id: every file of one session shares it, so a session's files cluster in the directory across recoveries and resumes (when no session id exists yet — the degenerate fallback — the deepest message entry's id is hashed the same way, so the key is always an opaque 8-hex cluster key)
- `<time>` — local file-creation time, `YYYYMMDD-HHmmss`

When the session's real name arrives after the file was created (e.g. Claudian generates its title only after the first reply), the next save renames the file once to `<name>-<key>-<original-time>.md` — keeping the original creation timestamp — and rewrites the frontmatter title and the document heading to match. The rename happens at most once: later `/name` changes never touch the filename, and manually renamed files are left alone.

````markdown
---
title: "Fix login redirect loop"
agent: "pi"
format_version: "2.1"
session_id: "d0a4f541-976d-4d1b-8e1c-30a1f2b3c4d5"
session_key: "c2088d77"
branch_last_entry_id: "019be3a2-1f4d-7c8a-9b01-d23e45f6a7b8"
model: "z-ai/glm-5.3"
provider: "openrouter"
cost: 0.023401
tokens: 18745
tokens_input: 15230
tokens_output: 3515
tokens_cache_read: 0
tokens_cache_write: 0
messages: 8
created: "2026-08-29T13:05:12+08:00"
updated: "2026-08-29T13:42:10+08:00"
project_root: "/Users/me/project"
session_file: "~/.pi/agent/sessions/--Users-me-project-20260829-050500_ab12.jsonl"
---

# Fix login redirect loop

User <span style="font-size: 0.5em; color: var(--text-faint);">2026-08-29 13:05:12</span>
===

The login page redirects in a loop after the auth refactor...

> [!quote]- Editor Selection
> [[src/auth/middleware.ts|middleware.ts]] · **lines**: `14-22`
>
> export function middleware(request) { … }

---

Assistant <span style="font-size: 0.5em; color: var(--text-faint);">2026-08-29 13:05:40 · claude-sonnet-4-5</span>
===

Fixed the middleware redirect order; login tests pass.

---
````

The body keeps each user question and the text of the last assistant reply before the next user message. Thinking, tool activity, intermediate updates and failed retries are omitted. Questions without a final reply are saved without an answer until one is available.

This format applies to newly generated or appended content; existing history is not rewritten. The `messages`, token and cost metadata still count the original session, including hidden tool messages.

Prompt blocks the client or the agent injects into a user message — the editor's active selection, attached or referenced notes, loaded skills — are re-rendered from their raw XML (which markdown viewers cannot present usefully — Obsidian shows it as literal angle-bracket text) into generic callouts. No block is parsed individually: the title is the tag name in words (`editor_selection` → Editor Selection), and the body opens with vault-shaped `path`/`location` values as bare wikilinks (`[[…|alias]]` is a clickable link in Obsidian, Quartz, and Markdown Preview Enhanced alike; the aliased filename speaks for itself — no `path:` label), followed by the remaining attributes as `**name**: value` items, then the content. Every callout is preset-collapsed — user-provided blocks (selections, note attachments) as `> [!quote]-`, even when they carry only attributes (the client emits note references as self-closing tags carrying just a path), agent-side skill traces as a `> [!note]- Skill · <name>` marker (the loaded skill's name rides the title, so the collapsed marker still says which skill; the location follows in the body, the content is dropped) — and consecutive blocks of the same tag (nothing but whitespace between them) merge into one callout, so a run of note references collapses into a single list. Unknown markup is left verbatim, so XML pasted as content is never mangled — and the fallback filename slug derives from the typed message with every known block stripped.

The recognized injected-block vocabulary:

| XML tag             | Renders as                    | What it carries                                 |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| `editor_selection`  | `[!quote]-` Editor Selection  | Selection in the code editor                    |
| `editor_cursor`     | `[!quote]-` Editor Cursor     | Cursor position in the editor                   |
| `current_note`      | `[!quote]-` Current Note      | The currently open note                         |
| `context_files`     | `[!quote]-` Context Files     | Files attached as context                       |
| `canvas_selection`  | `[!quote]-` Canvas Selection  | Selection on the canvas                         |
| `browser_selection` | `[!quote]-` Browser Selection | Selection in the browser view                   |
| `linked_note`       | `[!quote]-` Linked Note       | A note reference (the @-mention's machine copy) |
| `linked_content`    | `[!quote]-` Linked Content    | An attached note's content                      |
| `skill`             | `[!note]-` Skill · `<name>`   | Loaded-skill marker; content dropped            |
| any other tag       | verbatim                      | Pasted XML is never mangled                     |

Each message block opens with a setext level-1 info header (`User`, `Assistant`) underlined with `===` — one level above the `##` headings AI content typically starts with, and distinguishable from content `#` headings when parsing. The header's metadata (local date-time, and the model for assistant messages) sits in a small faint `<span>` (`0.5em`, Obsidian's `--text-faint` color — renderers without the variable fall back to the inherited text color), so the role stays visually dominant while the details remain a glance away. Each block ends with a `---` separator wrapped in single blank lines (extra blank lines are trimmed), so blocks are easy to tell apart both when reading and when splitting the file programmatically. The document heading sits directly after the frontmatter with no blank line between them; appends heal the blank line that older versions wrote there.

`cost` and the token fields cover the whole saved branch and include cached tokens (priced at the provider's cache rates), so the totals are comparable with provider-side accounting (e.g. OpenRouter activity). Requests that never landed in the session tree (failed retries, other sessions sharing the same API key) are necessarily excluded.

## Branch behavior

Pi sessions are trees: `/tree` navigates to an earlier point and a new prompt forks a new branch. Each markdown file records exactly **one branch** — the root-to-leaf path that branch sees.

- **Same branch, next turn** → new messages are _appended_ to the existing file, and the frontmatter (`cost`, `tokens`, `messages`, `updated`, title, model) is refreshed.
- **`/tree` + new prompt (a different branch)** → a _new file_ is created containing the full new branch (the shared prefix plus the new exchange). The save also notifies (info) that the branch changed, naming the new file and the earlier branch's kept file, so multiple files of one session stay navigable.
- **Forking at the current tip** → the existing file continues (its content is already an exact prefix of the new branch), so no duplicate file is created.
- **Resuming later** (restart, `/resume`, `/fork`, `/clone`) → the branch is recognized and its file continues where it left off.

Branch identity is persisted inside the session tree itself via extension custom entries (never sent to the LLM, not rendered in the TUI), so state survives restarts and navigation without any sidecar files. State discovery reads those entries straight from the session's jsonl on disk — the append log shared by every runtime — so even a long-lived warm process whose in-memory tree lags behind still finds saves recorded by other runtimes.

Continuation targets are validated newest-first: the target file must exist and its frontmatter `messages` count must cover the branch position (a higher count is fine — a descendant branch extended the same file). The first target that validates is continued; when the newest one fails but an older candidate validates, the save downgrades to the older file and warns about it. If every target fails — the file was deleted, or was rewritten from a different tree position (e.g. a save on an older branch after `/tree` navigation), where continuing could silently strand the newer branch's messages — a **fresh file with the full current branch** is written instead, with a warning naming the failed target. A fresh file never overwrites an existing filename either (an existing name falls back to `-1`, `-2` … suffixes), so two runtimes recovering the same lost file in the same second cannot silently overwrite each other. Every branch therefore always ends up with a complete, consistent file.

Compacted sessions still export their **full original history** — the archive always contains the complete conversation, not the compacted context.

## Debug

```bash
PI_CLAUDIAN_DEBUG=1 pi
```

Any value other than an explicit false token (empty, `0`, `false`, `no`, `off` — case-insensitive) enables it; unset the variable (or set one of those tokens) to turn it off.

## License

MIT
