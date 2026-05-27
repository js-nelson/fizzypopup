# fizzypopup

Bulk-create [Fizzy](https://fizzy.do) boards from a CSV file. For each board, automatically sets up a standard column structure and populates the Backlog with a configurable set of cards.

## Install

```bash
npm install -g fizzypopup
```

Or run without installing:

```bash
npx fizzypopup
```

## Usage

```
fizzypopup [options]

Options:
  -s, --slug <slug>      Fizzy account slug
  -t, --token <token>    Fizzy API access token
  -f, --file <path>      Path to CSV file
  -b, --base-url <url>   Fizzy base URL (default: "https://app.fizzy.do")
  -c, --cards <path>     Path to backlog cards JSON file (default: bundled config)
  -V, --version          output the version number
  -h, --help             display help for command
```

Any omitted option will be prompted for interactively. The file path prompt supports tab-completion.

The access token is masked when typed interactively.

## Examples

**Interactive** — prompts for everything:
```bash
fizzypopup
```

**Non-interactive** — supply all inputs as flags:
```bash
fizzypopup --slug my-org --token mytoken123 --file ./boards.csv
```

**Custom backlog cards:**
```bash
fizzypopup --slug my-org --token mytoken123 --file ./boards.csv --cards ./my-cards.json
```

## CSV format

Each row becomes one board. Column headers map to Fizzy board fields.

Example `boards.csv`:
```csv
name,description
Marketing,Campaigns and content
Engineering,Sprint planning
Design,Assets and reviews
```

## What gets created per board

For every row in the CSV, fizzypopup creates:

1. **The board** using the fields from that CSV row
2. **Five columns** in order: Backlog · Ready · In Progress · Testing · Done
3. **Backlog cards** from the cards JSON file, each triaged into the Backlog column

## Customizing backlog cards

The default cards are defined in `config/backlog-cards.json` inside the package. To use your own set, create a JSON file with an array of card objects and pass it via `--cards`:

```json
[
  { "title": "Define requirements" },
  { "title": "Set up development environment" },
  { "title": "Design system architecture" }
]
```

Each object supports `title` (required) and `description` (optional).

## Output

```
FizzyPopUp — Bulk Fizzy board creator

Base URL: https://app.fizzy.do
Boards:   3
Cards:    32 per backlog

  [1/3] Marketing
    ✓ board
    ✓ columns — Backlog · Ready · In Progress · Testing · Done
    ✓ cards — 32 added to Backlog

  [2/3] Engineering
    ✓ board
    ✓ columns — Backlog · Ready · In Progress · Testing · Done
    ✓ cards — 32 added to Backlog

  [3/3] Design
    ✓ board
    ✓ columns — Backlog · Ready · In Progress · Testing · Done
    ✓ cards — 32 added to Backlog

Done. 3 created
```

Exits with code `1` if any row fails, making it safe to use in scripts.

## Requirements

Node.js 18 or later.
