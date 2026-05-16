# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`fizzypopup` — a Node.js CLI tool for bulk-creating Fizzy boards from a CSV file. Published to npm; users install and run it with `npx fizzypopup` or globally via `npm install -g fizzypopup`.

## Running locally

```
npm install
node bin/fizzypopup.js [options]
```

## CLI usage

```
fizzypopup [options]

Options:
  -s, --slug <slug>     Fizzy account slug
  -t, --token <token>   Fizzy API access token
  -f, --file <path>     Path to CSV file
  -e, --endpoint <url>  API endpoint URL template
                        (default: https://api.fizzy.io/v1/accounts/{account_slug}/boards)
```

Any omitted option triggers an interactive prompt. The file path prompt supports tab-completion.

## Stack

- **Node.js ≥ 18** — uses built-in `fetch` (no node-fetch needed)
- **commander** — CLI argument parsing
- **inquirer v9** (ESM) — interactive prompts for slug and token (password-masked)
- **csv-parse** — CSV streaming parser
- Node's built-in **readline** — file path prompt with filesystem tab completion
- No build step; `"type": "module"` throughout

## Architecture

Everything lives in `bin/fizzypopup.js`:

1. **CLI layer** — commander parses flags; missing values fall through to interactive prompts
2. **Prompt layer** — inquirer handles text/password inputs; a separate `readline` interface with a `fileCompleter` function handles the file path prompt (readline is used here specifically to get native tab-completion, which inquirer doesn't support)
3. **CSV layer** — streams the file through csv-parse into an array of row objects
4. **API layer** — sequential `fetch` POSTs; each CSV row becomes the JSON body verbatim; `{account_slug}` in the endpoint template is substituted at runtime
5. **Output** — per-row status written with `process.stdout.write` using ANSI escape codes (no chalk dependency); exits with code 1 if any row fails

## Publishing to npm

```
npm login
npm publish
```

The `files` field in package.json limits the published artifact to `bin/` only.

## API assumptions

Default endpoint: `https://api.fizzy.io/v1/accounts/{account_slug}/boards`
Auth: `Authorization: Bearer <token>` header
Body: `Content-Type: application/json` — one object per CSV row, keys from CSV headers
