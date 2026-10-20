import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const required = [
  'README.md','package.json','package-lock.json','.nvmrc','.env.example','server/index.mjs','server/app.mjs',
  'server/db.mjs','server/security.mjs','server/time.mjs','shared/constants.mjs','public/index.html','public/sample.html',
  'client/src/app.js','client/src/api.js','client/src/dom.js','client/src/rehearsal.js','client/src/assistant.js','client/src/app.css','client/src/tokens.css',
  'tests/workflow.test.mjs','tests/time.test.mjs','tests/assistant.test.mjs','scripts/e2e-smoke.mjs','scripts/contrast.mjs','docs/legacy-audit.md','docs/feature-decisions.md','docs/data-model.md','docs/api.md',
  'docs/security.md','docs/supabase-migration.md','docs/dependencies.md','docs/assumptions.md','docs/design-system.md','docs/product-direction.md','docs/market-evidence.md','docs/ai-product-context.md',
  'docs/known-limitations.md','docs/test-report.md','docs/design-review.md'
];
for (const file of required) {
  try { await stat(join(root,file)); } catch { console.error(`BUILD FAILED: required file missing: ${file}`); process.exit(1); }
}
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes:true })) {
    const full = join(dir,entry.name);
    if (entry.isDirectory()) result.push(...await walk(full)); else result.push(full);
  }
  return result;
}
const jsFiles = (await walk(join(root,'server'))).concat(await walk(join(root,'client/src')), await walk(join(root,'shared')), await walk(join(root,'scripts')), await walk(join(root,'tests'))).filter(file => /\.(?:mjs|js)$/.test(file));
let syntaxFailed = false;
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (result.status !== 0) { syntaxFailed = true; console.error(result.stderr || result.stdout); }
}
if (syntaxFailed) process.exit(1);
const bundle = Buffer.concat(await Promise.all(['app.js','api.js','dom.js'].map(file => readFile(join(root,'client/src',file)))));
const gzipped = gzipSync(bundle).length;
if (gzipped > 250 * 1024) { console.error(`BUILD FAILED: initial JS gzip budget exceeded (${gzipped} bytes).`); process.exit(1); }
console.log(`Build verification PASSED: ${required.length} required files present; ${jsFiles.length} JavaScript modules syntax-checked; initial client JavaScript ${gzipped} bytes gzipped (budget 256000).`);
console.log('Note: no bundler is used because npm registry access was unavailable during preflight; this verifies the runnable native-module build, not a Vite bundle.');
