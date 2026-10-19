import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function files(dir) {
  const out=[];
  for (const item of await readdir(dir,{withFileTypes:true})) {
    const file=join(dir,item.name);
    if (item.isDirectory()) out.push(...await files(file)); else out.push(file);
  }
  return out;
}
const scan = (await files(join(root,'client/src'))).concat(await files(join(root,'public')));
let failed=false;
const issues=[];
for (const file of scan) {
  const content=await readFile(file,'utf8'); const name=relative(root,file);
  if (/\blocalStorage\b|Math\.random\s*\(|dangerouslySetInnerHTML/.test(content)) issues.push(`${name}: forbidden local/mock or unsafe rendering primitive`);
  if (/\sstyle\s*=/.test(content)) issues.push(`${name}: inline style attribute found; use shared CSS tokens and classes`);
  if (file.endsWith('.css') && !file.endsWith('tokens.css') && /#[0-9a-fA-F]{3,8}\b/.test(content)) issues.push(`${name}: raw colour found outside tokens.css`);
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\/(?!cadence\.local)/i.test(content)) issues.push(`${name}: external runtime URL found; local mode must not call third parties`);
}
const app = await readFile(join(root,'client/src/app.js'),'utf8');
for (const token of ['ana.moreau@cadence.demo','Medical consultation — Ruiz, Elena','setTimeout(','data-demo=']) {
  if (app.includes(token)) issues.push(`client/src/app.js: legacy simulated-content marker found (${token})`);
}
if (issues.length) { failed=true; for (const issue of issues) console.error(`LINT FAILED: ${issue}`); }
else console.log(`Lint verification PASSED: scanned ${scan.length} client/public files; no inline styles, raw component colours, unsafe HTML insertion, browser localStorage, mocked random IDs, legacy demo markers or third-party runtime URLs.`);
if (failed) process.exit(1);
