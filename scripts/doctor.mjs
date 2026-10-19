import { access, constants, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const run = (command,args=[]) => spawnSync(command,args,{encoding:'utf8',timeout:6000});
console.log('Cadence environment doctor');
console.log(`OS: ${process.platform} ${process.arch} ${run('uname',['-sr']).stdout.trim() || ''}`);
console.log(`Shell: ${process.env.SHELL || 'unknown (Windows users: PowerShell or cmd.exe)'}`);
console.log(`Node: ${process.version}`);
const npmVersion=run('npm',['-v']); console.log(`npm: ${(npmVersion.stdout||npmVersion.stderr).trim()}`);
try { await import('node:sqlite'); console.log('node:sqlite: available'); } catch (error) { console.error(`node:sqlite: unavailable (${error.message})`); process.exitCode=1; }
try { await access(root,constants.W_OK); const probe=join(root,'.doctor-write-probe'); await rm(probe,{recursive:true,force:true}); await mkdir(probe); await rm(probe,{recursive:true,force:true}); console.log('Project write permission: available'); } catch (error) { console.error(`Project write permission: unavailable (${error.message})`); process.exitCode=1; }
for (const binary of ['zip','unzip','chromium']) { const result=run('sh',['-lc',`command -v ${binary}`]); console.log(`${binary}: ${result.status===0 ? result.stdout.trim() : 'not found'}`); }
const ping=run('npm',['ping','--fetch-timeout=4000','--fetch-retries=0']);
console.log(`npm registry: ${ping.status===0 ? 'reachable' : 'NOT REACHABLE (dependency-free build selected)'}${ping.status===0?'':` — ${(ping.stderr||ping.stdout).trim().split('\n').slice(-2).join(' ')}`}`);
if (process.env.PORT) console.log(`PORT: ${process.env.PORT}`); else console.log('PORT: 4311 default; server binds to 127.0.0.1 only.');
