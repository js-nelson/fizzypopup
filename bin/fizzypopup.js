#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface } from 'readline';
import { existsSync, createReadStream, readdirSync, statSync } from 'fs';
import { resolve, dirname, basename, join } from 'path';
import { homedir } from 'os';
import { parse } from 'csv-parse';
import inquirer from 'inquirer';

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

// ── CLI definition ────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('fizzypopup')
  .description('Bulk-create Fizzy boards from a CSV file')
  .version('1.0.0')
  .option('-s, --slug <slug>',    'Fizzy account slug')
  .option('-t, --token <token>',  'Fizzy API access token')
  .option('-f, --file <path>',    'Path to CSV file')
  .option(
    '-e, --endpoint <url>',
    'API endpoint URL template',
    'https://app.fizzy.do/{account_slug}/boards'
  )
  .parse();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = program.opts();

  console.log(`\n${c.bold('FizzyPopUp')} ${c.dim('— Bulk Fizzy board creator')}\n`);

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

  const endpoint = opts.endpoint.replace('{account_slug}', encodeURIComponent(slug));
  const firstCol = Object.keys(rows[0])[0];

  console.log(`\n${c.dim('Endpoint:')} ${endpoint}`);
  console.log(`${c.dim('Rows:    ')} ${rows.length}\n`);

  // Create boards sequentially
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row   = rows[i];
    const label = row[firstCol] || `Row ${i + 1}`;
    const bodyData = JSON.stringify({ 
        board: {
            name: label
        }
    });
    console.log(`${label}: ${bodyData}`);

    process.stdout.write(`  ${c.dim(`[${i + 1}/${rows.length}]`)} ${label} … `);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
            'Accept': 'application/json'
        },
        body: bodyData
      });

      if (res.ok) {
        ok++;
        process.stdout.write(c.green('✓') + '\n');
      } else {
        fail++;
        let detail = `HTTP ${res.status}`;
        try { const t = await res.text(); if (t) detail += `: ${t.slice(0, 120)}`; } catch {}
        process.stdout.write(c.red(`✗  ${detail}`) + '\n');
      }
    } catch (err) {
      fail++;
      process.stdout.write(c.red(`✗  ${err.message}`) + '\n');
    }
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
