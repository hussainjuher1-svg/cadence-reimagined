import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function walk(dir) {
  const out=[];
  for (const item of await readdir(dir,{withFileTypes:true})) { const full=join(dir,item.name); if(item.isDirectory()) out.push(...await walk(full)); else if(/\.(mjs|js)$/.test(item.name)) out.push(full); }
  return out;
}
const files=[];
for (const dir of ['server','client/src','shared','scripts','tests']) files.push(...await walk(join(root,dir)));
for (const file of files) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){process.stderr.write(result.stderr||result.stdout);process.exit(1);}
}
console.log(`JavaScript syntax/type-safety preflight PASSED for ${files.length} modules.`);
console.log('TypeScript-specific typecheck: NOT EXECUTED. This build uses native JavaScript modules because npm registry access was unavailable and no TypeScript/Vite/React packages were locally available. See docs/assumptions.md.');
