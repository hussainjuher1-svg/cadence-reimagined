import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, basename } from 'node:path';
import { stat, rm } from 'node:fs/promises';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const parent = dirname(root);
const output = resolve(parent, `${basename(root)}.zip`);
const files = [
  'README.md','package.json','package-lock.json','.nvmrc','.env.example','.gitignore','.gitattributes',
  'client','public','server','shared','scripts','tests','docs'
];
await rm(output,{force:true});
const archiveFiles = files.map(file => `${basename(root)}/${file}`);
const args = ['-qr','-X',output,...archiveFiles,'-x',
  'cadence-reimagined/node_modules/*','cadence-reimagined/.env','cadence-reimagined/**/.env','cadence-reimagined/**/.env.local','cadence-reimagined/**/.env.production','cadence-reimagined/**/.env.development',
  'cadence-reimagined/data/*','cadence-reimagined/*.db','cadence-reimagined/*.sqlite',
  'cadence-reimagined/*.log','cadence-reimagined/dist/*','cadence-reimagined/coverage/*',
  'cadence-reimagined/.git/*','cadence-reimagined/test-results/*'
];
const result = spawnSync('zip',args,{cwd:parent,encoding:'utf8'});
if (result.status !== 0) { console.error(result.stderr || result.stdout || 'zip command failed'); process.exit(1); }
const info=await stat(output);
console.log(`Created ${output} (${info.size} bytes).`);
console.log('This command packages the source and docs; fresh extraction, install, test and start checks must be run separately and recorded.');
