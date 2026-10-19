import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createCadenceServer } from '../server/app.mjs';

const tempRoot = await mkdtemp(join(tmpdir(), 'cadence-tests-'));
let instant = new Date('2026-10-15T12:00:00.000Z');
const server = createCadenceServer({ dbPath: join(tempRoot, 'cadence.sqlite'), port: 0, clock: () => instant, baseUrl: 'http://localhost:4311' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

function makeClient() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([key,value]) => `${key}=${value}`).join('; ');
  return {
    jar,
    async request(path, { method = 'GET', body, headers = {}, withCsrf = true } = {}) {
      const initHeaders = new Headers(headers);
      const cookies = cookieHeader(); if (cookies) initHeaders.set('Cookie', cookies);
      if (body !== undefined) initHeaders.set('Content-Type', 'application/json');
      if (withCsrf && ['POST','PATCH','PUT','DELETE'].includes(method)) {
        const token = jar.get('cadence_csrf'); if (token) initHeaders.set('X-CSRF-Token', token);
      }
      if (['POST','PATCH','PUT','DELETE'].includes(method) && !initHeaders.has('Origin')) initHeaders.set('Origin', base);
      const response = await fetch(`${base}${path}`, { method, headers: initHeaders, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      const setCookies = response.headers.getSetCookie?.() || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
      for (const line of setCookies) {
        const match = /^([^=;]+)=([^;]*)/.exec(line);
        if (match) {
          const value = decodeURIComponent(match[2]);
          if (/Max-Age=0/i.test(line)) jar.delete(match[1]); else jar.set(match[1], value);
        }
      }
      const type = response.headers.get('content-type') || '';
      let payload;
      if (type.includes('application/json')) payload = await response.json();
      else payload = await response.text();
      return { response, payload };
    },
  };
}
const noAuth = makeClient();
const a = makeClient();
const b = makeClient();
const requireStatus = (result, status, label) => assert.equal(result.response.status, status, `${label}: ${JSON.stringify(result.payload)}`);

 test('Cadence API integration, persistence, lifecycle, export, recovery and ownership', async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    server.cadenceDb.close();
    await rm(tempRoot, { recursive: true, force: true });
  });

  const health = await a.request('/api/v1/health');
  requireStatus(health, 200, 'health');
  assert.equal(health.payload.status, 'ok');
  assert.ok(health.response.headers.get('content-security-policy'));

  const privateUnauth = await noAuth.request('/api/v1/sessions');
  requireStatus(privateUnauth, 401, 'private endpoint requires auth');
  assert.equal(privateUnauth.payload.error.code, 'UNAUTHORIZED');

  const weak = await a.request('/api/v1/auth/signup', { method:'POST', headers:{'Idempotency-Key':randomUUID()}, body:{displayName:'Interpreter A',email:'a@example.test',password:'short'} });
  requireStatus(weak, 400, 'weak password rejected');
  assert.ok(weak.payload.error.fieldErrors.password);

  const signupKey = randomUUID();
  const signUp = await a.request('/api/v1/auth/signup', { method:'POST', headers:{'Idempotency-Key':signupKey}, body:{displayName:'Interpreter A',email:'a@example.test',password:'a-long-unique-passphrase'} });
  requireStatus(signUp, 201, 'sign up');
  const ownerId = signUp.payload.user.id;
  assert.equal(signUp.payload.user.onboardingCompletedAt, null);
  const replaySignup = await a.request('/api/v1/auth/signup', { method:'POST', headers:{'Idempotency-Key':signupKey}, body:{displayName:'Interpreter A',email:'a@example.test',password:'a-long-unique-passphrase'} });
  requireStatus(replaySignup, 200, 'signup idempotency replay');
  assert.equal(replaySignup.payload.user.id, ownerId);
  const duplicateEmail = await a.request('/api/v1/auth/signup', { method:'POST', headers:{'Idempotency-Key':randomUUID()}, body:{displayName:'Other Name',email:'a@example.test',password:'a-long-unique-passphrase'} });
  requireStatus(duplicateEmail, 409, 'duplicate email');

  const onboard = await a.request('/api/v1/onboarding', { method:'POST', body:{displayName:'Interpreter A',defaultTimezone:'Asia/Dhaka',defaultLanguageFrom:'en',defaultLanguageTo:'fr',complete:true} });
  requireStatus(onboard, 200, 'onboarding');
  assert.ok(onboard.payload.user.onboardingCompletedAt);

  const createBody = { title:'Community workshop',clientLabel:'Arts Collective',languageFrom:'en',languageTo:'fr',scheduledStartLocal:'2026-10-20T10:00',timezone:'Asia/Dhaka' };
  const createKey = randomUUID();
  const created = await a.request('/api/v1/sessions', { method:'POST', headers:{'Idempotency-Key':createKey}, body:createBody });
  requireStatus(created, 201, 'create session');
  const sessionId = created.payload.session.id;
  assert.equal(created.payload.session.status, 'scheduled');
  assert.equal(created.payload.session.durationSeconds, null);
  const replay = await a.request('/api/v1/sessions', { method:'POST', headers:{'Idempotency-Key':createKey}, body:createBody });
  requireStatus(replay, 201, 'session idempotency replay');
  assert.equal(replay.payload.session.id, sessionId);
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
  const reusedKey = await a.request('/api/v1/sessions', { method:'POST', headers:{'Idempotency-Key':createKey}, body:{...createBody,title:'Different session'} });
  requireStatus(reusedKey, 409, 'idempotency key reuse with changed body');

  let workspace = await a.request(`/api/v1/sessions/${sessionId}/workspace`);
  requireStatus(workspace, 200, 'workspace read');
  assert.equal(workspace.payload.prepChecklist.filter(item=>item.complete).length, 0);
  const prep = await a.request(`/api/v1/sessions/${sessionId}/prep`, { method:'PATCH', body:{goal:'Explain the workshop schedule.',context:'A neighborhood art activity.',instructions:'Keep names and material terms consistent.',namesPronunciation:'Camille Laurent',toneRegister:'Friendly',openQuestions:''} });
  requireStatus(prep, 200, 'preparation save');
  assert.equal(prep.payload.preparation.goal, 'Explain the workshop schedule.');
  const check1 = await a.request(`/api/v1/sessions/${sessionId}/prep-checks`, { method:'PATCH', body:{itemKey:'instructions_reviewed',state:'done'} });
  requireStatus(check1, 200, 'explicit checklist mark');
  const check2 = await a.request(`/api/v1/sessions/${sessionId}/prep-checks`, { method:'PATCH', body:{itemKey:'questions_resolved',state:'not_needed'} });
  requireStatus(check2, 200, 'questions none marked');

  const term = await a.request(`/api/v1/sessions/${sessionId}/terms`, { method:'POST', body:{sourceTerm:'drying rack',targetTerm:'étagère de séchage',contextRegister:'Workshop materials'} });
  requireStatus(term, 201, 'term create while scheduled');
  const followup = await a.request(`/api/v1/sessions/${sessionId}/followups`, { method:'POST', body:{text:'Send the bilingual materials list.'} });
  requireStatus(followup, 201, 'follow-up create while scheduled');

  const start = await a.request(`/api/v1/sessions/${sessionId}/start`, { method:'POST', body:{} });
  requireStatus(start, 200, 'start session');
  assert.equal(start.payload.session.status, 'in_progress');
  const startTime = start.payload.session.startedAt;
  instant = new Date(instant.getTime() + 15000);
  const repeatedStart = await a.request(`/api/v1/sessions/${sessionId}/start`, { method:'POST', body:{} });
  requireStatus(repeatedStart, 200, 'repeated start idempotent');
  assert.equal(repeatedStart.payload.session.startedAt, startTime);

  const entry = await a.request(`/api/v1/sessions/${sessionId}/entries`, { method:'POST', body:{kind:'note',body:'Keep <script>alert(1)</script> as plain text.'} });
  requireStatus(entry, 201, 'entry create');
  assert.equal(entry.payload.entry.body, 'Keep <script>alert(1)</script> as plain text.');
  const editEntry = await a.request(`/api/v1/sessions/${sessionId}/entries/${entry.payload.entry.id}`, { method:'PATCH', body:{body:'Updated note with Unicode: বাংলা — café.'} });
  requireStatus(editEntry, 200, 'entry edit');
  assert.ok(editEntry.payload.entry.edited_at);
  const patchSession = await a.request(`/api/v1/sessions/${sessionId}`, { method:'PATCH', body:{title:'Updated community workshop',version:created.payload.session.version} });
  requireStatus(patchSession, 200, 'versioned session patch');
  const stalePatch = await a.request(`/api/v1/sessions/${sessionId}`, { method:'PATCH', body:{title:'Stale overwrite',version:created.payload.session.version} });
  requireStatus(stalePatch, 409, 'optimistic concurrency');
  assert.equal(stalePatch.payload.error.code, 'CONFLICT');

  const badCancel = await a.request(`/api/v1/sessions/${sessionId}/cancel`, { method:'POST', body:{} });
  requireStatus(badCancel, 409, 'cannot cancel in progress');
  const forbiddenBody = await a.request(`/api/v1/sessions/${sessionId}`, { method:'PATCH', body:{status:'completed',version:patchSession.payload.session.version} });
  requireStatus(forbiddenBody, 400, 'client cannot directly set status');

  instant = new Date(instant.getTime() + 75000);
  const complete = await a.request(`/api/v1/sessions/${sessionId}/complete`, { method:'POST', body:{summary:'The workshop introduction was interpreted and materials were explained.',durationSeconds:1,turnCount:999,endedAt:'1900-01-01T00:00:00.000Z',status:'scheduled'} });
  requireStatus(complete, 200, 'complete with server-authoritative time');
  assert.equal(complete.payload.session.status, 'completed');
  assert.ok(complete.payload.session.durationSeconds >= 89, `duration should be server-computed: ${complete.payload.session.durationSeconds}`);
  assert.notEqual(complete.payload.session.endedAt, '1900-01-01T00:00:00.000Z');
  const after = await a.request(`/api/v1/sessions/${sessionId}/workspace`);
  requireStatus(after, 200, 'completed record reload');
  assert.equal(after.payload.session.completionSummary, 'The workshop introduction was interpreted and materials were explained.');
  assert.equal(after.payload.entries[0].body, 'Updated note with Unicode: বাংলা — café.');
  assert.equal(after.payload.terms[0].targetTerm, 'étagère de séchage');
  assert.equal(after.payload.followups[0].status, 'open');
  const stable = await a.request(`/api/v1/sessions/${sessionId}/workspace`);
  assert.deepEqual(stable.payload, after.payload, 'completed record must reopen identically with no writes');

  const toggle = await a.request(`/api/v1/sessions/${sessionId}/followups/${followup.payload.followup.id}`, { method:'PATCH', body:{status:'done'} });
  requireStatus(toggle, 200, 'completed follow-up status editable');
  assert.equal(toggle.payload.followup.status, 'done');
  assert.ok(toggle.payload.followup.resolved_at);
  const textEditAfterCompletion = await a.request(`/api/v1/sessions/${sessionId}/followups/${followup.payload.followup.id}`, { method:'PATCH', body:{text:'change after complete'} });
  requireStatus(textEditAfterCompletion, 409, 'completed follow-up text read-only');
  const termEditAfterCompletion = await a.request(`/api/v1/sessions/${sessionId}/terms/${term.payload.term.id}`, { method:'PATCH', body:{targetTerm:'changed'} });
  requireStatus(termEditAfterCompletion, 409, 'completed terminology read-only');
  const addendum = await a.request(`/api/v1/sessions/${sessionId}/summary`, { method:'PATCH', body:{summaryAddendum:'Coordinator confirmed the materials list.'} });
  requireStatus(addendum, 200, 'completed summary editable');
  assert.equal(addendum.payload.session.completionSummary, 'Coordinator confirmed the materials list.');

  const jsonExport = await a.request(`/api/v1/sessions/${sessionId}/export?format=json`);
  requireStatus(jsonExport, 200, 'JSON export');
  assert.match(jsonExport.response.headers.get('content-disposition') || '', /attachment/);
  assert.equal(jsonExport.payload.schemaVersion, 1);
  assert.equal(jsonExport.payload.session.completionSummary, 'Coordinator confirmed the materials list.');
  const markdownExport = await a.request(`/api/v1/sessions/${sessionId}/export?format=markdown`);
  requireStatus(markdownExport, 200, 'Markdown export');
  assert.match(markdownExport.payload, /# Updated community workshop/);
  assert.match(markdownExport.payload, /\\*|Coordinator/);
  assert.ok(markdownExport.payload.length > 30);

  await b.request('/api/v1/health');
  const otherSignup = await b.request('/api/v1/auth/signup', { method:'POST', headers:{'Idempotency-Key':randomUUID()}, body:{displayName:'Interpreter B',email:'b@example.test',password:'another-long-unique-passphrase'} });
  requireStatus(otherSignup, 201, 'second account sign up');
  const crossWorkspace = await b.request(`/api/v1/sessions/${sessionId}/workspace`);
  requireStatus(crossWorkspace, 404, 'cross-account workspace access hidden');
  const crossEntry = await b.request(`/api/v1/sessions/${sessionId}/entries/${entry.payload.entry.id}`, { method:'DELETE' });
  requireStatus(crossEntry, 404, 'cross-account child record access hidden');
  const unauthWorkspace = await noAuth.request(`/api/v1/sessions/${sessionId}/workspace`);
  requireStatus(unauthWorkspace, 401, 'unauthenticated private record access');

  const csrfFail = await b.request('/api/v1/settings', { method:'PATCH', body:{displayName:'No CSRF'}, withCsrf:false });
  requireStatus(csrfFail, 403, 'CSRF is required');
  const badOrigin = await b.request('/api/v1/settings', { method:'PATCH', headers:{Origin:'https://attacker.invalid'}, body:{displayName:'No origin'} });
  requireStatus(badOrigin, 403, 'Origin is checked');
  const settings = await b.request('/api/v1/settings', { method:'PATCH', body:{displayName:'Interpreter B Updated',defaultTimezone:'Asia/Dhaka',defaultLanguageFrom:'en',defaultLanguageTo:'fr'} });
  requireStatus(settings, 200, 'settings save');
  assert.equal(settings.payload.user.displayName, 'Interpreter B Updated');

  const outboxBefore = await readFile(join(tempRoot,'dev-outbox.jsonl'),'utf8').catch(()=> '');
  const recovery = await a.request('/api/v1/auth/recovery/request', { method:'POST', body:{email:'a@example.test'} });
  requireStatus(recovery, 200, 'recovery request');
  assert.match(recovery.payload.message, /No email is sent/);
  const outbox = await readFile(join(tempRoot,'dev-outbox.jsonl'),'utf8');
  assert.ok(outbox.length > outboxBefore.length);
  const lastLine = outbox.trim().split('\n').at(-1);
  const resetUrl = JSON.parse(lastLine).resetUrl;
  const hashRoute = new URL(resetUrl).hash.slice(1);
  const resetToken = new URL(hashRoute,'http://cadence.local').searchParams.get('token');
  assert.ok(resetToken);
  const reset = await a.request('/api/v1/auth/recovery/confirm', { method:'POST', body:{token:resetToken,password:'new-long-unique-passphrase'} });
  requireStatus(reset, 200, 'password reset confirmation');
  const oldSession = await a.request('/api/v1/auth/me');
  requireStatus(oldSession, 200, 'me response after reset');
  assert.equal(oldSession.payload.authenticated, false, 'reset revokes old auth sessions');
  const oldSignIn = await a.request('/api/v1/auth/signin', { method:'POST', body:{email:'a@example.test',password:'a-long-unique-passphrase'} });
  requireStatus(oldSignIn, 401, 'old password invalid after reset');
  const newSignIn = await a.request('/api/v1/auth/signin', { method:'POST', body:{email:'a@example.test',password:'new-long-unique-passphrase'} });
  requireStatus(newSignIn, 200, 'new password works after reset');

  for (let attempt=0; attempt<5; attempt++) {
    const wrong = await b.request('/api/v1/auth/signin', { method:'POST', body:{email:'lockout@example.test',password:'wrong-password'} });
    requireStatus(wrong, 401, `generic sign-in failure ${attempt+1}`);
    assert.match(wrong.payload.error.message, /email or password is incorrect/i);
  }
  const locked = await b.request('/api/v1/auth/signin', { method:'POST', body:{email:'lockout@example.test',password:'wrong-password'} });
  requireStatus(locked, 429, 'per-account sign-in failures are rate limited');
  assert.ok(Number(locked.response.headers.get('retry-after')) > 0);
  const tooLarge = await fetch(`${base}/api/v1/auth/recovery/request`, { method:'POST', headers:{Cookie:[...b.jar.entries()].map(([key,value])=>`${key}=${value}`).join('; '),'Content-Type':'application/json','X-CSRF-Token':b.jar.get('cadence_csrf')||'','Origin':base}, body:JSON.stringify({email:'x'.repeat(101*1024)}) });
  requireStatus({response:tooLarge,payload:await tooLarge.json()}, 413, 'request body size cap');

  const deleteSession = await a.request(`/api/v1/sessions/${sessionId}`, { method:'DELETE' });
  requireStatus(deleteSession, 200, 'session hard delete');
  const replayDeleted = await a.request('/api/v1/sessions', { method:'POST', headers:{'Idempotency-Key':createKey}, body:createBody });
  requireStatus(replayDeleted, 409, 'idempotency replay cannot fabricate a deleted session');
  assert.equal(replayDeleted.payload.error.code, 'IDEMPOTENCY_RESOURCE_GONE');
  assert.equal(server.cadenceDb.prepare('SELECT COUNT(*) AS n FROM sessions WHERE owner_id=?').get(ownerId).n, 0);
  assert.equal(server.cadenceDb.prepare('SELECT COUNT(*) AS n FROM entries WHERE session_id=?').get(sessionId).n, 0);
  assert.equal(server.cadenceDb.prepare('SELECT COUNT(*) AS n FROM terms WHERE session_id=?').get(sessionId).n, 0);
  assert.equal(server.cadenceDb.prepare('SELECT COUNT(*) AS n FROM followups WHERE session_id=?').get(sessionId).n, 0);

  const deleteB = await b.request('/api/v1/account', { method:'DELETE', body:{currentPassword:'another-long-unique-passphrase',confirm:true} });
  requireStatus(deleteB, 200, 'account deletion');
  assert.equal(server.cadenceDb.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').get(otherSignup.payload.user.id).n, 0);
  assert.equal((await b.request('/api/v1/auth/me')).payload.authenticated, false);
 });
