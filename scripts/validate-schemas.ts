/**
 * CI gate: every JSON Schema under packages/ ** /schema/*.json must compile.
 * Run with: pnpm schema:validate
 */
import Ajv from 'ajv';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'packages';

function findSchemas(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...findSchemas(full));
    } else if (full.replaceAll('\\', '/').includes('/schema/') && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

const files = findSchemas(ROOT);
if (files.length === 0) {
  console.error('no schema files found under packages/**/schema/*.json');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  try {
    ajv.compile(JSON.parse(readFileSync(file, 'utf8')));
    console.log(`ok   ${file}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${file}: ${(err as Error).message}`);
  }
}

process.exit(failed ? 1 : 0);
