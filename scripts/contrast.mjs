import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const css = await readFile(`${root}/client/src/tokens.css`, 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map(m => [m[1],m[2]]));
function rgb(hex) { const h=hex.slice(1); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4); }
function lum(hex) { const [r,g,b]=rgb(hex); return 0.2126*r+0.7152*g+0.0722*b; }
function ratio(a,b) { const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); }
const pairs = [
  ['body text / background','--color-text','--color-bg',4.5],
  ['body text / surface','--color-text','--color-surface',4.5],
  ['muted text / background','--color-muted','--color-bg',4.5],
  ['subtle text / background','--color-subtle','--color-bg',4.5],
  ['white text / accent button','--color-accent-contrast','--color-accent',4.5],
  ['white text / danger button','--color-accent-contrast','--color-danger',4.5],
  ['hero copy / page background','--color-hero-copy','--color-bg',4.5],
  ['hero muted copy / page background','--color-hero-muted','--color-bg',4.5],
  ['primary session copy / soft accent surface','--color-primary-session-copy','--color-accent-soft',4.5],
  ['accent / surface border context','--color-accent','--color-surface',3],
  ['focus ring / surface','--color-focus','--color-surface',3],
  ['warning text / warning surface','--color-warning','--color-warning-soft',4.5],
  ['success text / success surface','--color-success','--color-success-soft',4.5],
  ['danger text / danger surface','--color-danger','--color-danger-soft',4.5],
];
let failed=false;
console.log('Token-based WCAG contrast ratios (calculation only; not a complete UI audit)');
for (const [label,fg,bg,min] of pairs) {
 const a=tokens[fg], b=tokens[bg];
 if(!a||!b){console.log(`NOT EXECUTED ${label}: token missing`); failed=true; continue;}
 const value=ratio(a,b);
 console.log(`${value>=min?'PASS':'FAIL'} ${label}: ${value.toFixed(2)}:1 (target ${min}:1; ${fg}=${a}; ${bg}=${b})`);
 if(value<min) failed=true;
}
if(failed) process.exitCode=1;
