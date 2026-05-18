# fizzypopup

Bulk-create [Fizzy](https://fizzy.do) boards from a CSV file.

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
  -s, --slug <slug>     Fizzy account slug
  -t, --token <token>   Fizzy API access token
  -f, --file <path>     Path to CSV file
  -e, --endpoint <url>  API endpoint URL template
  -V, --version         output the version number
  -h, --help            display help for command
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

## CSV format

Each row becomes one board. Column headers are sent as-is as JSON keys in the request body, so name them to match what the Fizzy API expects.

Example `boards.csv`:
```csv
name,description
Marketing,Campaigns and content
Engineering,Sprint planning
Design,Assets and reviews
```

## Output

```
FizzyPopUp — Bulk Fizzy board creator

Endpoint: https://app.fizzy.do/my-org/boards
Rows:     3

  [1/3] Marketing … ✓
  [2/3] Engineering … ✓
  [3/3] Design … ✓

Done. 3 created
```

Exits with code `1` if any row fails, making it safe to use in scripts.

## Requirements

Node.js 18 or later.
