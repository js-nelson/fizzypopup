# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A self-contained single-file web app for bulk-creating Fizzy boards from a CSV. Open `index.html` directly in a browser — no build step, no server required.

## Running

```
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

## Stack

- **React 18** — loaded via CDN (`unpkg.com`), JSX transpiled in-browser by Babel Standalone
- **PapaParse 5** — CSV parsing via CDN
- All dependencies are `<script>` tags; there is no `package.json` or build toolchain

## Architecture

Everything lives in `index.html` as a single `<script type="text/babel">` block:

- **Configuration section** — endpoint URL template (supports `{account_slug}` placeholder), account slug, access token (show/hide toggle)
- **CSV section** — file picker → PapaParse → preview table (first 5 rows), full row count
- **Actions/Results section** — appears after CSV load; runs sequential POST requests, shows per-row status (idle/pending/success/error) and a progress bar; Stop button sets an `abortRef` to halt mid-run

Each CSV row is sent as the POST body verbatim (CSV headers become JSON keys). The endpoint URL has `{account_slug}` replaced at run time.

## API assumptions

Default endpoint: `https://api.fizzy.io/v1/accounts/{account_slug}/boards`  
Auth: `Authorization: Bearer <token>` header  
Body: `Content-Type: application/json` — one object per CSV row

The endpoint field is user-editable, so the exact URL can be corrected without touching code.

## CORS note

Browsers enforce CORS for `fetch()` even when the file is opened locally. The Fizzy API must return appropriate `Access-Control-Allow-Origin` headers, or requests will be blocked.
