#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'readline';
import { existsSync, createReadStream, readdirSync, statSync, readFileSync } from 'fs';
import { resolve, dirname, basename, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { Agent, fetch } from 'undici';
import { parse } from 'csv-parse';
import inquirer from 'inquirer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const h2Agent = new Agent({allowH2: true});

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const c = {
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
};

// ── File path prompt with tab completion ──────────────────────────────────────

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function fileCompleter(partial) {
  try {
    const expanded = expandHome(partial);
    const trailingSlash = partial.endsWith('/');
    const dir    = trailingSlash ? expanded         : (dirname(expanded) || '.');
    const prefix = trailingSlash ? partial          : partial.slice(0, partial.lastIndexOf('/') + 1);
    const stub   = trailingSlash ? ''               : basename(expanded);

    return [
      readdirSync(dir)
        .filter(e => e.startsWith(stub))
        .map(e => {
          let isDir = false;
          try { isDir = statSync(join(dir, e)).isDirectory(); } catch {}
          return prefix + e + (isDir ? '/' : '');
        }),
      partial,
    ];
  } catch {
    return [[], partial];
  }
}

function promptFilePath(message) {
  return new Promise(res => {
    const rl = createInterface({
      input:     process.stdin,
      output:    process.stdout,
      completer: fileCompleter,
      terminal:  true,
    });
    rl.question(`? ${message} `, answer => {
      rl.close();
      res(expandHome(answer.trim()));
    });
  });
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

async function parseCSV(filePath) {
  const rows = [];
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );
  for await (const row of parser) rows.push(row);
  return rows;
}

// ── Fizzy API ─────────────────────────────────────────────────────────────────

async function apiPost(url, token, body, debug = false) {
  const bodyStr = JSON.stringify(body, null, 4);

  if (debug) {
    const masked = `Bearer ${token.slice(0, 4)}${'•'.repeat(Math.max(0, token.length - 4))}`;
    console.error(c.dim(`\n  → POST ${url}`));
    console.error(c.dim(`  → authorization: ${masked}`));
    console.error(c.dim(`  → content-type: application/json`));
    console.error(c.dim(`  → accept: application/json`));
    console.error(c.dim(`  → body: ${bodyStr}`));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type':  'application/json',
      'accept':        'application/json',
      'user-agent': 'fizzypopup/1.1.0'
    },
    body: bodyStr,
    dispatcher: h2Agent
  });

  if (debug) console.error(c.dim(`  ← ${res.status}`));

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}, ${text}`);
  }

  return res;
}

async function createBoard(baseUrl, slug, token, boardData, debug) {
  const res = await apiPost(`${baseUrl}/${slug}/boards`, token, { board: boardData }, debug);
  return res.json();
}

async function createColumn(baseUrl, slug, token, boardId, name, debug) {
  const res = await apiPost(`${baseUrl}/${slug}/boards/${boardId}/columns`, token, { column: { name } }, debug);
  return res.json();
}

async function createCard(baseUrl, slug, token, boardId, cardData, debug) {
  const res = await apiPost(`${baseUrl}/${slug}/boards/${boardId}/cards`, token, { card: cardData }, debug);
  return res.json();
}

async function triageCard(baseUrl, slug, token, cardNumber, columnId, debug) {
  await apiPost(`${baseUrl}/${slug}/cards/${cardNumber}/triage`, token, { column_id: columnId }, debug);
}

// ── Per-row processing ────────────────────────────────────────────────────────

const COLUMNS = ['Backlog', 'Ready', 'In Progress', 'Testing', 'Done'];

async function processRow({ row, index, total, slug, token, baseUrl, backlogCards, debug }) {
  const label = Object.values(row)[0] || `Row ${index + 1}`;
  console.log(`  ${c.dim(`[${index + 1}/${total}]`)} ${c.bold(label)}`);

  // 1. Create board
  let board;
  try {
    board = await createBoard(baseUrl, slug, token, row, debug);
    process.stdout.write(`    ${c.green('✓')} board\n`);
  } catch (err) {
    process.stdout.write(`    ${c.red('✗')} board — ${c.dim(err.message)}\n`);
    return false;
  }

  // 2. Create columns
  let backlogId = null;
  const colStatus = [];
  for (const name of COLUMNS) {
    try {
      const col = await createColumn(baseUrl, slug, token, board.id, name, debug);
      if (name === 'Backlog') backlogId = col.id;
      colStatus.push({ name, ok: true });
    } catch {
      colStatus.push({ name, ok: false });
    }
  }
  const allColsOk = colStatus.every(s => s.ok);
  const colLine   = colStatus.map(s => (s.ok ? c.green(s.name) : c.red(s.name))).join(c.dim(' · '));
  process.stdout.write(`    ${allColsOk ? c.green('✓') : c.red('✗')} columns — ${colLine}\n`);

  if (!backlogId) {
    process.stdout.write(`    ${c.dim('– cards (skipped: Backlog column failed)')}\n`);
    return false;
  }

  // 3. Create backlog cards and triage them into the Backlog column
  let cardOk = 0, cardFail = 0;
  for (const cardData of backlogCards) {
    try {
      const card = await createCard(baseUrl, slug, token, board.id, cardData, debug);
      await triageCard(baseUrl, slug, token, card.number, backlogId, debug);
      cardOk++;
    } catch {
      cardFail++;
    }
  }
  const cardsOk = cardFail === 0;
  const cardLine = cardsOk
    ? c.green(`${cardOk} added to Backlog`)
    : `${c.green(cardOk)} added, ${c.red(cardFail + ' failed')}`;
  process.stdout.write(`    ${cardsOk ? c.green('✓') : c.red('✗')} cards — ${cardLine}\n`);

  return allColsOk && cardsOk;
}

// ── CLI definition ────────────────────────────────────────────────────────────

const DEFAULT_CARDS_FILE = join(__dirname, '../config/backlog-cards.json');

const program = new Command();

program
  .name('fizzypopup')
  .description('Bulk-create Fizzy boards from a CSV file')
  .version('1.1.0')
  .option('-s, --slug <slug>',      'Fizzy account slug')
  .option('-t, --token <token>',    'Fizzy API access token')
  .option('-f, --file <path>',      'Path to CSV file')
  .option('-b, --base-url <url>',   'Fizzy base URL', 'https://app.fizzy.do')
  .option('-c, --cards <path>',     'Path to backlog cards JSON file', DEFAULT_CARDS_FILE)
  .option('-d, --debug',            'Print each request URL and body before sending')
  .parse();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = program.opts();

  console.log(`\n${c.bold('FizzyPopUp')} ${c.dim('— Bulk Fizzy board creator')}\n`);

  // Load backlog cards config
  let backlogCards;
  try {
    backlogCards = JSON.parse(readFileSync(opts.cards, 'utf8'));
    if (!Array.isArray(backlogCards)) throw new Error('must be a JSON array');
  } catch (err) {
    console.error(c.red(`Failed to load cards file (${opts.cards}): ${err.message}`));
    process.exit(1);
  }

  // Gather inputs — prompt for anything not supplied on the command line
  let slug     = opts.slug;
  let token    = opts.token;
  let filePath = opts.file;

  if (!slug || !token) {
    const questions = [];
    if (!slug)  questions.push({ type: 'input',    name: 'slug',  message: 'Account slug:',  validate: v => v.trim() ? true : 'Required' });
    if (!token) questions.push({ type: 'password', name: 'token', message: 'Access token:',  mask: '•', validate: v => v.trim() ? true : 'Required' });
    const answers = await inquirer.prompt(questions);
    slug  = slug  || answers.slug;
    token = token || answers.token;
  }

  if (!filePath) {
    filePath = await promptFilePath('CSV file path:');
  }

  filePath = resolve(expandHome(filePath));

  if (!existsSync(filePath)) {
    console.error(c.red(`\nFile not found: ${filePath}`));
    process.exit(1);
  }

  // Parse CSV
  let rows;
  try {
    rows = await parseCSV(filePath);
  } catch (err) {
    console.error(c.red(`\nCSV parse error: ${err.message}`));
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error(c.yellow('\nCSV contains no data rows.'));
    process.exit(1);
  }

  const { baseUrl } = opts;

  console.log(`${c.dim('Base URL:')} ${baseUrl}`);
  console.log(`${c.dim('Boards:  ')} ${rows.length}`);
  console.log(`${c.dim('Cards:   ')} ${backlogCards.length} per backlog\n`);

  // Process each board
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const success = await processRow({
      row: rows[i], index: i, total: rows.length,
      slug, token, baseUrl, backlogCards, debug: opts.debug,
    });
    if (success) ok++; else fail++;
    if (i < rows.length - 1) console.log();
  }

  // Summary
  const parts = [c.green(`${ok} created`)];
  if (fail > 0) parts.push(c.red(`${fail} failed`));
  console.log(`\n${c.bold('Done.')} ${parts.join(', ')}\n`);

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error(c.red(`\nUnexpected error: ${err.message}`));
  process.exit(1);
});
