import { createServer } from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { openDatabase } from './db.mjs';
import { HttpError, fail } from './errors.mjs';
import { hashPassword, verifyPassword, tokenHash, newToken, id, timingSafeTextEqual } from './security.mjs';
import { validTimeZone, localDateTimeToUtc } from './time.mjs';
import { ENTRY_KINDS, LANGUAGE_TAG, LIMITS } from '../shared/constants.mjs';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
});
const COOKIE_SESSION = 'cadence_session';
const COOKIE_CSRF = 'cadence_csrf';
const ALLOWED_CHECKS = new Set(['instructions_reviewed', 'questions_resolved', 'terminology_not_needed']);
const BLOCKED_PASSWORDS = new Set(['password123', '1234567890', 'qwerty12345', 'letmein1234', 'admin123456', 'welcome1234']);
const DUMMY_PASSWORD_HASH_PROMISE = hashPassword(newToken());

const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const emailValid = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const normalizedEmail = value => String(value ?? '').trim().toLowerCase();
const stringValue = (v) => typeof v === 'string' ? v.trim() : '';
const languageValid = value => typeof value === 'string' && value.length <= 35 && LANGUAGE_TAG.test(value);
const addCookie = (res, text) => { res._setCookies ??= []; res._setCookies.push(text); };
const cookieString = (name, value, { httpOnly = false, maxAge, secure = false } = {}) => {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) bits.push('HttpOnly');
  if (secure) bits.push('Secure');
  if (maxAge !== undefined) bits.push(`Max-Age=${maxAge}`);
  return bits.join('; ');
};
const parseCookies = req => {
  const out = {};
  for (const pair of String(req.headers.cookie || '').split(';')) {
    const ix = pair.indexOf('='); if (ix < 0) continue;
    try { out[pair.slice(0, ix).trim()] = decodeURIComponent(pair.slice(ix + 1).trim()); } catch { /* malformed cookies are ignored */ }
  }
  return out;
};
const send = (res, status, body, headers = {}) => {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const normalized = { ...headers, 'Content-Length': payload.length, 'Cache-Control': headers['Cache-Control'] || 'no-store' };
  if (res._setCookies?.length) normalized['Set-Cookie'] = [...(Array.isArray(normalized['Set-Cookie']) ? normalized['Set-Cookie'] : (normalized['Set-Cookie'] ? [normalized['Set-Cookie']] : [])), ...res._setCookies];
  res.writeHead(status, normalized); res.end(payload);
};
const sendJson = (res, status, body, headers = {}) => send(res, status, body, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
const publicUser = user => ({
  id: user.id, email: user.email, displayName: user.display_name, defaultTimezone: user.default_timezone,
  defaultLanguageFrom: user.default_language_from, defaultLanguageTo: user.default_language_to,
  onboardingStep: user.onboarding_step, onboardingCompletedAt: user.onboarding_completed_at,
  createdAt: user.created_at
});
const publicSession = row => ({
  id: row.id, title: row.title, clientLabel: row.client_label, languageFrom: row.language_from, languageTo: row.language_to,
  scheduledStartUtc: row.scheduled_start_utc, timezone: row.timezone, status: row.status, startedAt: row.started_at,
  endedAt: row.ended_at, cancelledAt: row.cancelled_at, durationSeconds: row.duration_seconds,
  completionSummary: row.completion_summary, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  noteCount: row.note_count ?? 0, termCount: row.term_count ?? 0, openFollowupCount: row.open_followup_count ?? 0
});
const field = (body, key, max, { required = false, allowEmpty = true } = {}) => {
  const value = stringValue(body[key]);
  if (required && !value) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { [key]: 'This field is required.' });
  if (value.length > max) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { [key]: `Use ${max} characters or fewer.` });
  if (!allowEmpty && !value) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { [key]: 'This field is required.' });
  return value;
};
const rejectUnknown = (body, allowed) => {
  const unknown = Object.keys(body || {}).filter(key => !allowed.includes(key));
  if (unknown.length) fail(400, 'UNKNOWN_FIELD', `Unexpected field: ${unknown[0]}.`);
};
const validPassword = password => {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) return 'Use a password between 10 and 128 characters.';
  if (BLOCKED_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.';
  return '';
};

export function createCadenceServer({ dbPath, publicDir, clock = () => new Date(), port = Number(process.env.PORT || 4311), production = process.env.NODE_ENV === 'production', baseUrl = process.env.CADENCE_BASE_URL } = {}) {
  if (production) throw new Error('Cadence local development mode cannot run with NODE_ENV=production. Production authentication, HTTPS termination, secrets management, backups and monitoring are not configured.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const publicRoot = resolve(publicDir || join(root, 'public'));
  const defaultDataRoot = resolve(process.env.CADENCE_DATA_DIR || join(root, 'data'));
  const actualDbPath = resolve(dbPath || join(defaultDataRoot, 'cadence.sqlite'));
  mkdirSync(dirname(actualDbPath), { recursive: true });
  const db = openDatabase(actualDbPath);
  const nowDate = () => new Date(clock());
  const nowIso = () => nowDate().toISOString();
  const withOffset = ms => new Date(nowDate().getTime() + ms).toISOString();
  const rateLimit = (key, limit, windowMs) => {
    const instant = nowDate().getTime();
    const row = db.prepare('SELECT * FROM rate_limit_buckets WHERE key=?').get(key);
    if (!row || instant - row.window_started_at >= windowMs) {
      db.prepare('INSERT INTO rate_limit_buckets(key,window_started_at,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_started_at=excluded.window_started_at,hits=1').run(key, instant);
      return 0;
    }
    if (row.hits >= limit) return Math.max(1, Math.ceil((windowMs - (instant - row.window_started_at)) / 1000));
    db.prepare('UPDATE rate_limit_buckets SET hits=hits+1 WHERE key=?').run(key);
    return 0;
  };
  const pruneData = () => {
    const now = nowIso();
    const epoch = nowDate().getTime();
    const ninetyDaysAgo = withOffset(-90 * 24 * 60 * 60 * 1000);
    const dayAgo = withOffset(-24 * 60 * 60 * 1000);
    db.prepare('DELETE FROM auth_sessions WHERE idle_expires_at<=? OR absolute_expires_at<=? OR (revoked_at IS NOT NULL AND revoked_at<?)').run(now, now, ninetyDaysAgo);
    db.prepare('DELETE FROM password_reset_tokens WHERE expires_at<=? OR (used_at IS NOT NULL AND used_at<?)').run(now, ninetyDaysAgo);
    db.prepare('DELETE FROM rate_limit_buckets WHERE window_started_at<?').run(epoch - 24 * 60 * 60 * 1000);
    db.prepare('DELETE FROM request_idempotency WHERE created_at<?').run(dayAgo);
    db.prepare('DELETE FROM idempotency_keys WHERE created_at<?').run(dayAgo);
    db.prepare('DELETE FROM activity_log WHERE created_at<?').run(ninetyDaysAgo);
  };
  pruneData();
  const pruneTimer = setInterval(() => { try { pruneData(); } catch (error) { console.error(`[maintenance] Data pruning failed: ${error?.name || 'Error'}`); } }, 6 * 60 * 60 * 1000);
  pruneTimer.unref();
  const logEvent = (userId, eventType, recordId = null) => {
    db.prepare('INSERT INTO activity_log(user_id,event_type,record_id,created_at) VALUES(?,?,?,?)').run(userId || null, eventType, recordId, nowIso());
  };
  const clearCookie = (res, name, httpOnly = true) => addCookie(res, cookieString(name, '', { httpOnly, maxAge: 0 }));
  const ensureCsrf = (req, res) => {
    const current = parseCookies(req)[COOKIE_CSRF];
    if (current) return current;
    const token = newToken();
    addCookie(res, cookieString(COOKIE_CSRF, token));
    return token;
  };
  const validateCsrf = (req) => {
    const cookies = parseCookies(req);
    if (!cookies[COOKIE_CSRF] || !req.headers['x-csrf-token'] || !timingSafeTextEqual(cookies[COOKIE_CSRF], req.headers['x-csrf-token'])) {
      fail(403, 'CSRF_INVALID', 'Your request could not be verified. Refresh the page and try again.');
    }
    const origin = req.headers.origin;
    if (origin) {
      let parsed;
      try { parsed = new URL(origin); } catch { fail(403, 'ORIGIN_INVALID', 'The request origin could not be verified.'); }
      if (parsed.host !== req.headers.host) fail(403, 'ORIGIN_INVALID', 'The request origin could not be verified.');
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_INVALID', 'Cross-site requests are not allowed.');
  };
  const readJson = async (req, { optional = false } = {}) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType && optional) return {};
    if (contentType !== 'application/json') fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send this request as application/json.');
    const chunks = []; let total = 0;
    try {
      for await (const chunk of req) {
        total += chunk.length;
        if (total > LIMITS.requestBytes) fail(413, 'BODY_TOO_LARGE', 'The request is too large. Keep it under 100 KB.');
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      fail(400, 'INVALID_REQUEST', 'The request body could not be read.');
    }
    if (!total) return {};
    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { fail(400, 'INVALID_JSON', 'The request body must contain valid JSON.'); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail(400, 'INVALID_JSON', 'The request body must be a JSON object.');
    return parsed;
  };
  const userFromRequest = req => {
    const raw = parseCookies(req)[COOKIE_SESSION];
    if (!raw) return null;
    const now = nowIso();
    const row = db.prepare(`SELECT u.*, a.id AS auth_session_id, a.absolute_expires_at
      FROM auth_sessions a JOIN users u ON u.id=a.user_id
      WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.idle_expires_at>? AND a.absolute_expires_at>?`).get(tokenHash(raw), now, now);
    if (!row) return null;
    const absolute = new Date(row.absolute_expires_at).getTime();
    const idleExpiry = new Date(Math.min(nowDate().getTime() + LIMITS.sessionIdleMs, absolute)).toISOString();
    db.prepare('UPDATE auth_sessions SET last_seen_at=?,idle_expires_at=? WHERE id=?').run(now, idleExpiry, row.auth_session_id);
    return row;
  };
  const requireAuth = req => {
    const user = userFromRequest(req);
    if (!user) fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
    return user;
  };
  const getOwnedSession = (userId, sessionId) => {
    const row = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM entries e WHERE e.session_id=s.id AND e.kind='note') AS note_count,
      (SELECT COUNT(*) FROM terms t WHERE t.session_id=s.id) AS term_count,
      (SELECT COUNT(*) FROM followups f WHERE f.session_id=s.id AND f.status='open') AS open_followup_count
      FROM sessions s WHERE s.id=? AND s.owner_id=?`).get(sessionId, userId);
    if (!row) fail(404, 'NOT_FOUND', 'That session was not found.');
    return row;
  };
  const requireEditable = row => {
    if (!['scheduled', 'in_progress'].includes(row.status)) fail(409, 'SESSION_READ_ONLY', 'This session is read-only after completion or cancellation.');
  };
  const requireInProgress = row => {
    if (row.status !== 'in_progress') fail(409, 'INVALID_TRANSITION', 'Start the session before editing its conversation stream.');
  };
  const getWorkspace = (user, sessionId) => {
    const row = getOwnedSession(user.id, sessionId);
    const prep = db.prepare('SELECT * FROM session_prep WHERE session_id=?').get(sessionId) || {};
    const checkRows = db.prepare('SELECT item_key,state,updated_at FROM prep_checks WHERE session_id=?').all(sessionId);
    const checkMap = Object.fromEntries(checkRows.map(item => [item.item_key, item]));
    const entries = db.prepare('SELECT id,kind,body,sequence,created_at,edited_at FROM entries WHERE session_id=? AND owner_id=? ORDER BY sequence').all(sessionId, user.id);
    const terms = db.prepare('SELECT id,source_term AS sourceTerm,target_term AS targetTerm,context_register AS contextRegister,created_at AS createdAt,updated_at AS updatedAt FROM terms WHERE session_id=? AND owner_id=? ORDER BY created_at,id').all(sessionId, user.id);
    const followups = db.prepare('SELECT id,text,status,created_at,resolved_at,updated_at FROM followups WHERE session_id=? AND owner_id=? ORDER BY created_at,id').all(sessionId, user.id);
    const checklist = [
      { key: 'goal_written', label: 'Goal written', complete: !!stringValue(prep.goal) },
      { key: 'context_written', label: 'Context written', complete: !!stringValue(prep.context) },
      { key: 'terminology_ready', label: 'At least one term recorded or no terminology needed', complete: terms.length > 0 || ['done','not_needed'].includes(checkMap.terminology_not_needed?.state) },
      { key: 'instructions_reviewed', label: 'Instructions reviewed', complete: checkMap.instructions_reviewed?.state === 'done', updatedAt: checkMap.instructions_reviewed?.updated_at || null },
      { key: 'questions_resolved', label: 'Open questions resolved or none', complete: ['done','not_needed'].includes(checkMap.questions_resolved?.state), updatedAt: checkMap.questions_resolved?.updated_at || null },
    ];
    return {
      session: publicSession(row),
      preparation: { goal: prep.goal || '', context: prep.context || '', instructions: prep.instructions || '', toneRegister: prep.tone_register || '', namesPronunciation: prep.names_pronunciation || '', openQuestions: prep.open_questions || '', updatedAt: prep.updated_at || null },
      prepChecks: Object.fromEntries([...ALLOWED_CHECKS].map(key => [key, { state: checkMap[key]?.state || 'pending', updatedAt: checkMap[key]?.updated_at || null }])),
      prepChecklist: checklist,
      entries, terms, followups,
      serverNow: nowIso()
    };
  };
  const createAuthSession = (userId, remember = false) => {
    const raw = newToken(); const createdAt = nowIso();
    const abs = new Date(nowDate().getTime() + LIMITS.sessionAbsoluteMs).toISOString();
    const idle = new Date(Math.min(nowDate().getTime() + LIMITS.sessionIdleMs, new Date(abs).getTime())).toISOString();
    db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,NULL)')
      .run(id(), userId, tokenHash(raw), createdAt, createdAt, idle, abs);
    return { raw, cookie: cookieString(COOKIE_SESSION, raw, { httpOnly: true, maxAge: remember ? LIMITS.sessionAbsoluteMs / 1000 : undefined }) };
  };
  const saveResetOutbox = async (user, rawToken, requestBase) => {
    const created = nowIso();
    db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,NULL,?)')
      .run(id(), user.id, tokenHash(rawToken), withOffset(LIMITS.resetTokenMs), created);
    const canonical = baseUrl || `http://localhost:${port}`;
    const link = `${canonical.replace(/\/$/, '')}/#/reset?token=${encodeURIComponent(rawToken)}`;
    const line = JSON.stringify({ createdAt: created, email: user.email, resetUrl: link, expiresAt: withOffset(LIMITS.resetTokenMs) }) + '\n';
    const outboxPath = join(dirname(actualDbPath), 'dev-outbox.jsonl');
    await appendFile(outboxPath, line, { encoding: 'utf8', mode: 0o600 });
    console.info(`[local-mailer] Password-reset link for ${user.email}: ${link}`);
  };

  const createServerInstance = createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    ensureCsrf(req, res);
    let url;
    try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch { sendJson(res, 400, { error: { code: 'INVALID_URL', message: 'The request URL is invalid.', requestId } }); return; }
    const pathname = url.pathname;
    const method = req.method || 'GET';
    try {
      if (!pathname.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') { sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.', requestId } }); return; }
        await serveStatic(pathname, res, requestId);
        return;
      }
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) validateCsrf(req);
      if (method === 'OPTIONS') { send(res, 204, Buffer.alloc(0), { 'Allow': 'GET, POST, PATCH, DELETE, OPTIONS' }); return; }
      if (method === 'GET' && pathname === '/api/v1/health') return sendJson(res, 200, { status: 'ok', service: 'cadence-local', serverNow: nowIso() });
      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        const user = userFromRequest(req);
        return sendJson(res, 200, { authenticated: !!user, user: user ? publicUser(user) : null, serverNow: nowIso() });
      }

      if (pathname.startsWith('/api/v1/auth/')) {
        if (pathname === '/api/v1/auth/signup' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['displayName','email','password']);
          const name = field(body, 'displayName', 80, { required: true });
          const email = normalizedEmail(body.email);
          if (!emailValid(email)) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { email: 'Enter a valid email address (254 characters or fewer).' });
          const passwordProblem = validPassword(body.password);
          if (passwordProblem) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { password: passwordProblem });
          const ip = req.socket.remoteAddress || 'local';
          const waitIp = rateLimit(`signup:ip:${ip}`, 10, 60 * 60 * 1000);
          if (waitIp) { res.setHeader('Retry-After', String(waitIp)); fail(429, 'RATE_LIMITED', 'Too many account-creation attempts. Try again later.'); }
          const idemKey = String(req.headers['idempotency-key'] || '');
          if (!/^[A-Za-z0-9_-]{16,128}$/.test(idemKey)) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'This request needs an idempotency key. Please submit the form again.');
          // Do not persist a fast digest of the password in an idempotency row. Compare only
          // public fields, then verify a replayed password against the account's scrypt hash.
          const requestHash = jsonHash({ name, email });
          const prior = db.prepare('SELECT * FROM request_idempotency WHERE key=? AND purpose=\'signup\'').get(idemKey);
          if (prior) {
            if (prior.request_hash !== requestHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This submission key was already used for different information. Refresh the form and try again.');
            const user = db.prepare('SELECT * FROM users WHERE id=?').get(prior.response_user_id);
            if (!user) fail(409, 'SIGNUP_REPLAY_EXPIRED', 'That submission can no longer be replayed. Please use the sign-in page.');
            if (!await verifyPassword(body.password, user.password_hash)) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'That submission key does not match these account credentials. Please sign in instead.');
            const auth = createAuthSession(user.id, true); addCookie(res, auth.cookie);
            return sendJson(res, 200, { user: publicUser(user), replayed: true });
          }
          const existing = db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email);
          if (existing) fail(409, 'EMAIL_EXISTS', 'An account already uses this email address.', { email: 'Use another email address or sign in.' });
          const userId = id(); const timestamp = nowIso(); const digest = await hashPassword(body.password);
          db.prepare('INSERT INTO users(id,email,display_name,password_hash,default_timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
            .run(userId, email, name, digest, 'UTC', timestamp, timestamp);
          db.prepare('INSERT INTO request_idempotency(key,purpose,request_hash,response_user_id,created_at) VALUES(?,?,?,?,?)')
            .run(idemKey, 'signup', requestHash, userId, timestamp);
          const auth = createAuthSession(userId, true); addCookie(res, auth.cookie); logEvent(userId, 'auth.signup');
          const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
          return sendJson(res, 201, { user: publicUser(user) });
        }
        if (pathname === '/api/v1/auth/signin' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['email','password','remember']);
          const email = normalizedEmail(body.email); const password = typeof body.password === 'string' ? body.password : '';
          const ip = req.socket.remoteAddress || 'local';
          const accountKey = `signin:account:${email.slice(0,254)}`;
          const waitIp = rateLimit(`signin:ip:${ip}`, 20, 15 * 60 * 1000);
          const accountBucket = db.prepare('SELECT window_started_at,hits FROM rate_limit_buckets WHERE key=?').get(accountKey);
          const nowMs = nowDate().getTime();
          const accountBlocked = accountBucket && nowMs - accountBucket.window_started_at < 15 * 60 * 1000 && accountBucket.hits >= 5;
          const accountWait = accountBlocked ? Math.max(1, Math.ceil((15 * 60 * 1000 - (nowMs - accountBucket.window_started_at)) / 1000)) : 0;
          const wait = Math.max(waitIp, accountWait);
          if (wait) { res.setHeader('Retry-After', String(wait)); fail(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.'); }
          if (!emailValid(email) || password.length < 1 || password.length > 128) {
            rateLimit(accountKey, 5, 15 * 60 * 1000);
            fail(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
          }
          const user = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);
          const comparisonHash = user ? user.password_hash : await DUMMY_PASSWORD_HASH_PROMISE;
          const ok = await verifyPassword(password, comparisonHash);
          if (!user || !ok) {
            rateLimit(accountKey, 5, 15 * 60 * 1000);
            fail(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
          }
          db.prepare('DELETE FROM rate_limit_buckets WHERE key=?').run(accountKey);
          const auth = createAuthSession(user.id, !!body.remember); addCookie(res, auth.cookie); logEvent(user.id, 'auth.signin');
          return sendJson(res, 200, { user: publicUser(user) });
        }
        if (pathname === '/api/v1/auth/signout' && method === 'POST') {
          const user = userFromRequest(req); const raw = parseCookies(req)[COOKIE_SESSION];
          if (raw) db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(nowIso(), tokenHash(raw));
          if (user) logEvent(user.id, 'auth.signout');
          clearCookie(res, COOKIE_SESSION); return sendJson(res, 200, { signedOut: true });
        }
        if (pathname === '/api/v1/auth/recovery/request' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['email']);
          const ip = req.socket.remoteAddress || 'local'; const wait = rateLimit(`recovery:ip:${ip}`, 5, 60 * 60 * 1000);
          if (wait) { res.setHeader('Retry-After', String(wait)); fail(429, 'RATE_LIMITED', 'Too many reset requests. Try again later.'); }
          const email = normalizedEmail(body.email);
          if (emailValid(email)) {
            const user = db.prepare('SELECT id,email FROM users WHERE email=? COLLATE NOCASE').get(email);
            if (user) {
              db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(nowIso(), user.id);
              await saveResetOutbox(user, newToken(), baseUrl);
            }
          }
          return sendJson(res, 200, { message: 'If an account exists, a reset link has been written to the local server terminal and data/dev-outbox.jsonl. No email is sent in local mode.' });
        }
        if (pathname === '/api/v1/auth/recovery/confirm' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['token','password']);
          const token = stringValue(body.token); const password = typeof body.password === 'string' ? body.password : '';
          const passwordProblem = validPassword(password);
          if (passwordProblem) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { password: passwordProblem });
          if (!token) fail(400, 'RESET_INVALID', 'This reset link is invalid or expired. Request a new one.');
          const row = db.prepare(`SELECT p.*,u.id AS account_id FROM password_reset_tokens p JOIN users u ON u.id=p.user_id
            WHERE p.token_hash=? AND p.used_at IS NULL AND p.expires_at>?`).get(tokenHash(token), nowIso());
          if (!row) fail(400, 'RESET_INVALID', 'This reset link is invalid or expired. Request a new one.');
          const digest = await hashPassword(password); const timestamp = nowIso();
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(digest, timestamp, row.user_id);
            db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(timestamp, row.user_id);
            db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(timestamp, row.user_id);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          clearCookie(res, COOKIE_SESSION); logEvent(row.user_id, 'auth.password_reset');
          return sendJson(res, 200, { message: 'Password updated. Sign in with your new password.' });
        }
        if (pathname === '/api/v1/auth/password/change' && method === 'POST') {
          const user = requireAuth(req); const body = await readJson(req); rejectUnknown(body, ['currentPassword','newPassword']);
          const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
          const next = typeof body.newPassword === 'string' ? body.newPassword : '';
          const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
          if (!await verifyPassword(current, row.password_hash)) fail(400, 'CURRENT_PASSWORD_INVALID', 'The current password is incorrect.', { currentPassword: 'Enter your current password.' });
          const passwordProblem = validPassword(next); if (passwordProblem) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { newPassword: passwordProblem });
          if (current === next) fail(400, 'VALIDATION_ERROR', 'Choose a different password.', { newPassword: 'Use a different password.' });
          const digest = await hashPassword(next); const timestamp = nowIso();
          db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(digest, timestamp, user.id);
          db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(timestamp, user.id);
          db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(timestamp, user.id);
          clearCookie(res, COOKIE_SESSION); logEvent(user.id, 'auth.password_change');
          return sendJson(res, 200, { message: 'Password changed. Sign in again with your new password.' });
        }
      }

      if (pathname === '/api/v1/onboarding') {
        const user = requireAuth(req);
        if (method === 'GET') return sendJson(res, 200, { user: publicUser(user), serverNow: nowIso() });
        if (method === 'POST' || method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['displayName','defaultTimezone','defaultLanguageFrom','defaultLanguageTo','complete']);
          const displayName = body.displayName === undefined ? user.display_name : field(body, 'displayName', 80, { required: true });
          const timezone = body.defaultTimezone === undefined ? user.default_timezone : field(body, 'defaultTimezone', 80, { required: true });
          const from = body.defaultLanguageFrom === undefined ? user.default_language_from : field(body, 'defaultLanguageFrom', 35);
          const to = body.defaultLanguageTo === undefined ? user.default_language_to : field(body, 'defaultLanguageTo', 35);
          if (!validTimeZone(timezone)) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { defaultTimezone: 'Choose a valid IANA time zone.' });
          if ((from && !languageValid(from)) || (to && !languageValid(to))) fail(400, 'VALIDATION_ERROR', 'Choose valid language tags.', { languages: 'Use valid language tags such as en, fr, or bn.' });
          if (from && to && from.toLowerCase() === to.toLowerCase()) fail(400, 'VALIDATION_ERROR', 'Choose two different languages.', { defaultLanguageTo: 'Source and target languages must differ.' });
          const isComplete = body.complete === true;
          db.prepare('UPDATE users SET display_name=?,default_timezone=?,default_language_from=?,default_language_to=?,onboarding_step=?,onboarding_completed_at=?,updated_at=? WHERE id=?')
            .run(displayName, timezone, from, to, isComplete ? 3 : Math.max(1, user.onboarding_step), isComplete ? nowIso() : user.onboarding_completed_at, nowIso(), user.id);
          const updated = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
          return sendJson(res, 200, { user: publicUser(updated) });
        }
      }

      if (pathname === '/api/v1/settings') {
        const user = requireAuth(req);
        if (method === 'GET') return sendJson(res, 200, { user: publicUser(user), localMode: true });
        if (method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['displayName','defaultTimezone','defaultLanguageFrom','defaultLanguageTo']);
          const name = body.displayName === undefined ? user.display_name : field(body, 'displayName', 80, { required: true });
          const zone = body.defaultTimezone === undefined ? user.default_timezone : field(body, 'defaultTimezone', 80, { required: true });
          const from = body.defaultLanguageFrom === undefined ? user.default_language_from : field(body, 'defaultLanguageFrom', 35);
          const to = body.defaultLanguageTo === undefined ? user.default_language_to : field(body, 'defaultLanguageTo', 35);
          if (!validTimeZone(zone)) fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', { defaultTimezone: 'Choose a valid IANA time zone.' });
          if ((from && !languageValid(from)) || (to && !languageValid(to))) fail(400, 'VALIDATION_ERROR', 'Choose valid language tags.', { languages: 'Use valid language tags such as en, fr, or bn.' });
          if (from && to && from.toLowerCase() === to.toLowerCase()) fail(400, 'VALIDATION_ERROR', 'Choose two different languages.', { defaultLanguageTo: 'Source and target languages must differ.' });
          db.prepare('UPDATE users SET display_name=?,default_timezone=?,default_language_from=?,default_language_to=?,updated_at=? WHERE id=?').run(name, zone, from, to, nowIso(), user.id);
          logEvent(user.id, 'settings.update');
          return sendJson(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
        }
      }
      if (pathname === '/api/v1/account' && method === 'DELETE') {
        const user = requireAuth(req); const body = await readJson(req); rejectUnknown(body, ['currentPassword','confirm']);
        if (body.confirm !== true) fail(400, 'CONFIRMATION_REQUIRED', 'Confirm account deletion before continuing.');
        const password = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
        if (!await verifyPassword(password, row.password_hash)) fail(400, 'CURRENT_PASSWORD_INVALID', 'The current password is incorrect.', { currentPassword: 'Enter your current password.' });
        const raw = parseCookies(req)[COOKIE_SESSION];
        db.prepare('DELETE FROM activity_log WHERE user_id=?').run(user.id);
        db.prepare('DELETE FROM request_idempotency WHERE response_user_id=?').run(user.id);
        db.prepare('DELETE FROM users WHERE id=?').run(user.id);
        if (raw) clearCookie(res, COOKIE_SESSION);
        return sendJson(res, 200, { deleted: true, message: 'The account and its stored records were deleted from this local database.' });
      }

      if (pathname === '/api/v1/sessions' && method === 'GET') {
        const user = requireAuth(req);
        const urlLimit = Number(url.searchParams.get('limit') || LIMITS.pageSize);
        const limit = Math.min(LIMITS.pageSize, Math.max(1, Number.isFinite(urlLimit) ? Math.trunc(urlLimit) : LIMITS.pageSize));
        const rows = db.prepare(`SELECT s.*,
          (SELECT COUNT(*) FROM entries e WHERE e.session_id=s.id AND e.kind='note') AS note_count,
          (SELECT COUNT(*) FROM terms t WHERE t.session_id=s.id) AS term_count,
          (SELECT COUNT(*) FROM followups f WHERE f.session_id=s.id AND f.status='open') AS open_followup_count
          FROM sessions s WHERE s.owner_id=? ORDER BY CASE s.status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
          CASE WHEN s.status='scheduled' THEN s.scheduled_start_utc END ASC, COALESCE(s.ended_at,s.cancelled_at,s.updated_at) DESC LIMIT ?`).all(user.id, limit);
        return sendJson(res, 200, { sessions: rows.map(publicSession), serverNow: nowIso(), limit });
      }
      if (pathname === '/api/v1/sessions' && method === 'POST') {
        const user = requireAuth(req); const body = await readJson(req);
        rejectUnknown(body, ['title','clientLabel','languageFrom','languageTo','scheduledStartLocal','timezone']);
        const title = field(body, 'title', LIMITS.sessionTitle, { required: true });
        const client = field(body, 'clientLabel', LIMITS.clientLabel);
        const from = field(body, 'languageFrom', 35, { required: true }); const to = field(body, 'languageTo', 35, { required: true });
        const timezone = field(body, 'timezone', 80, { required: true });
        if (!languageValid(from) || !languageValid(to)) fail(400, 'VALIDATION_ERROR', 'Choose valid language tags.', { languageFrom: 'Use a language tag such as en.', languageTo: 'Use a language tag such as fr.' });
        if (from.toLowerCase() === to.toLowerCase()) fail(400, 'VALIDATION_ERROR', 'Choose two different languages.', { languageTo: 'Source and target languages must differ.' });
        const scheduled = localDateTimeToUtc(body.scheduledStartLocal, timezone);
        const idemKey = String(req.headers['idempotency-key'] || '');
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(idemKey)) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'This request needs an idempotency key. Please submit the form again.');
        const requestHash = jsonHash({ title, client, from, to, scheduled, timezone });
        const prior = db.prepare('SELECT * FROM idempotency_keys WHERE user_id=? AND key=?').get(user.id, idemKey);
        if (prior) {
          if (prior.request_hash !== requestHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This submission key was already used for different session details. Refresh the form and try again.');
          const persisted = db.prepare('SELECT id FROM sessions WHERE id=? AND owner_id=?').get(prior.resource_id, user.id);
          if (!persisted) fail(409, 'IDEMPOTENCY_RESOURCE_GONE', 'The session created by that submission has since been deleted. Use a new submission key to create another session.');
          return sendJson(res, 201, { session: publicSession(getOwnedSession(user.id, prior.resource_id)) }, { 'Idempotency-Replayed': 'true' });
        }
        const timestamp = nowIso(); const sessionId = id();
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`INSERT INTO sessions(id,owner_id,title,client_label,language_from,language_to,scheduled_start_utc,timezone,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?, 'scheduled',?,?)`).run(sessionId, user.id, title, client, from, to, scheduled, timezone, timestamp, timestamp);
          db.prepare('INSERT INTO session_prep(session_id,updated_at) VALUES(?,?)').run(sessionId, timestamp);
          const result = { session: publicSession(getOwnedSession(user.id, sessionId)) };
          db.prepare('INSERT INTO idempotency_keys(user_id,key,request_hash,resource_id,created_at) VALUES(?,?,?,?,?)').run(user.id, idemKey, requestHash, sessionId, timestamp);
          db.exec('COMMIT'); logEvent(user.id, 'session.create', sessionId);
          return sendJson(res, 201, result);
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }

      const match = /^\/api\/v1\/sessions\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(pathname);
      if (match) {
        const user = requireAuth(req); let sessionId;
        try { sessionId = decodeURIComponent(match[1]); } catch { fail(404, 'NOT_FOUND', 'That session was not found.'); }
        const resource = match[2] || ''; let childId = match[3] ? decodeURIComponent(match[3]) : '';
        const row = getOwnedSession(user.id, sessionId);
        if (!resource && method === 'GET') return sendJson(res, 200, { session: publicSession(row), serverNow: nowIso() });
        if (!resource && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['title','clientLabel','languageFrom','languageTo','scheduledStartLocal','timezone','version']);
          if (!['scheduled','in_progress'].includes(row.status)) fail(409, 'SESSION_READ_ONLY', 'Core session details are read-only after completion or cancellation.');
          if (!Number.isInteger(body.version) || body.version < 1) fail(400, 'VERSION_REQUIRED', 'Reload this session before saving changes.');
          if (body.version !== row.version) fail(409, 'CONFLICT', 'This session changed in another tab. Reload or review the current record.', { currentSession: publicSession(row) });
          const title = body.title === undefined ? row.title : field(body, 'title', LIMITS.sessionTitle, { required: true });
          const client = body.clientLabel === undefined ? row.client_label : field(body, 'clientLabel', LIMITS.clientLabel);
          const from = body.languageFrom === undefined ? row.language_from : field(body, 'languageFrom', 35, { required: true });
          const to = body.languageTo === undefined ? row.language_to : field(body, 'languageTo', 35, { required: true });
          if (!languageValid(from) || !languageValid(to) || from.toLowerCase() === to.toLowerCase()) fail(400, 'VALIDATION_ERROR', 'Choose two different valid language tags.', { languages: 'Choose two different valid language tags.' });
          let timezone = row.timezone; let scheduled = row.scheduled_start_utc;
          if (body.scheduledStartLocal !== undefined || body.timezone !== undefined) {
            if (body.scheduledStartLocal === undefined || body.timezone === undefined) fail(400, 'VALIDATION_ERROR', 'Send the local date/time and time zone together.', { scheduledStartLocal: 'Date/time and time zone are both required.' });
            timezone = field(body, 'timezone', 80, { required: true }); scheduled = localDateTimeToUtc(body.scheduledStartLocal, timezone);
          }
          db.prepare('UPDATE sessions SET title=?,client_label=?,language_from=?,language_to=?,scheduled_start_utc=?,timezone=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=?')
            .run(title, client, from, to, scheduled, timezone, nowIso(), sessionId, user.id, body.version);
          const updated = getOwnedSession(user.id, sessionId); logEvent(user.id, 'session.update', sessionId);
          return sendJson(res, 200, { session: publicSession(updated) });
        }
        if (!resource && method === 'DELETE') {
          db.prepare('DELETE FROM sessions WHERE id=? AND owner_id=?').run(sessionId, user.id); logEvent(user.id, 'session.delete', sessionId);
          return sendJson(res, 200, { deleted: true, id: sessionId });
        }
        if (resource === 'workspace' && method === 'GET') return sendJson(res, 200, getWorkspace(user, sessionId));
        if (resource === 'start' && method === 'POST') {
          if (row.status === 'in_progress') return sendJson(res, 200, { session: publicSession(row), alreadyStarted: true });
          if (row.status !== 'scheduled') fail(409, 'INVALID_TRANSITION', 'Only scheduled sessions can be started.');
          const startedAt = nowIso(); db.prepare("UPDATE sessions SET status='in_progress',started_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='scheduled'").run(startedAt, startedAt, sessionId, user.id);
          logEvent(user.id, 'session.start', sessionId); return sendJson(res, 200, { session: publicSession(getOwnedSession(user.id, sessionId)), serverNow: nowIso() });
        }
        if (resource === 'cancel' && method === 'POST') {
          if (row.status !== 'scheduled') fail(409, 'INVALID_TRANSITION', 'Only scheduled sessions can be cancelled. An in-progress session must be completed.');
          const timestamp = nowIso(); db.prepare("UPDATE sessions SET status='cancelled',cancelled_at=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND status='scheduled'").run(timestamp, timestamp, sessionId, user.id);
          logEvent(user.id, 'session.cancel', sessionId); return sendJson(res, 200, { session: publicSession(getOwnedSession(user.id, sessionId)) });
        }
        if (resource === 'complete' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['summary','durationSeconds','turnCount','endedAt','status']);
          const summary = field(body, 'summary', LIMITS.summary);
          if (row.status !== 'in_progress' || !row.started_at) fail(409, 'INVALID_TRANSITION', 'Only an in-progress session can be completed.');
          const endedAt = nowDate(); const startedAt = new Date(row.started_at);
          const duration = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)); const endIso = endedAt.toISOString();
          db.prepare("UPDATE sessions SET status='completed',ended_at=?,duration_seconds=?,completion_summary=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND status='in_progress'")
            .run(endIso, duration, summary, endIso, sessionId, user.id);
          logEvent(user.id, 'session.complete', sessionId);
          return sendJson(res, 200, { session: publicSession(getOwnedSession(user.id, sessionId)), serverNow: nowIso() });
        }
        if (resource === 'summary' && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['summaryAddendum']);
          if (row.status !== 'completed') fail(409, 'INVALID_TRANSITION', 'A summary addendum is only available after completion.');
          const summary = field(body, 'summaryAddendum', LIMITS.summary);
          db.prepare('UPDATE sessions SET completion_summary=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND status=\'completed\'').run(summary, nowIso(), sessionId, user.id);
          logEvent(user.id, 'session.summary_addendum', sessionId); return sendJson(res, 200, { session: publicSession(getOwnedSession(user.id, sessionId)) });
        }
        if (resource === 'prep' && method === 'GET') return sendJson(res, 200, { workspace: getWorkspace(user, sessionId) });
        if (resource === 'prep' && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['goal','context','instructions','toneRegister','namesPronunciation','openQuestions']);
          requireEditable(row);
          const old = db.prepare('SELECT * FROM session_prep WHERE session_id=?').get(sessionId);
          const next = {
            goal: body.goal === undefined ? old.goal : field(body, 'goal', 2000),
            context: body.context === undefined ? old.context : field(body, 'context', 4000),
            instructions: body.instructions === undefined ? old.instructions : field(body, 'instructions', 4000),
            toneRegister: body.toneRegister === undefined ? old.tone_register : field(body, 'toneRegister', 500),
            namesPronunciation: body.namesPronunciation === undefined ? old.names_pronunciation : field(body, 'namesPronunciation', 2000),
            openQuestions: body.openQuestions === undefined ? old.open_questions : field(body, 'openQuestions', 3000),
          };
          const timestamp = nowIso();
          db.prepare('UPDATE session_prep SET goal=?,context=?,instructions=?,tone_register=?,names_pronunciation=?,open_questions=?,updated_at=? WHERE session_id=?')
            .run(next.goal,next.context,next.instructions,next.toneRegister,next.namesPronunciation,next.openQuestions,timestamp,sessionId);
          logEvent(user.id, 'session.preparation_save', sessionId);
          return sendJson(res, 200, { preparation: { ...next, updatedAt: timestamp }, serverNow: timestamp });
        }
        if (resource === 'prep-checks' && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['itemKey','state']); requireEditable(row);
          if (!ALLOWED_CHECKS.has(body.itemKey) || !['pending','done','not_needed'].includes(body.state)) fail(400, 'VALIDATION_ERROR', 'Choose a valid preparation checklist item and state.');
          const timestamp = nowIso();
          db.prepare('INSERT INTO prep_checks(session_id,item_key,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(session_id,item_key) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(sessionId, body.itemKey, body.state, timestamp);
          return sendJson(res, 200, { itemKey: body.itemKey, state: body.state, updatedAt: timestamp, workspace: getWorkspace(user, sessionId) });
        }
        if (resource === 'entries' && method === 'GET') return sendJson(res, 200, { entries: getWorkspace(user, sessionId).entries });
        if (resource === 'entries' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['kind','body']); requireInProgress(row);
          const kind = body.kind; if (!ENTRY_KINDS.includes(kind)) fail(400, 'VALIDATION_ERROR', 'Choose source text, interpreted text, or note.', { kind: 'Choose a valid entry type.' });
          const text = field(body, 'body', LIMITS.entryBody, { required: true }); const timestamp = nowIso(); const entryId = id();
          const seq = db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM entries WHERE session_id=?').get(sessionId).next;
          db.prepare('INSERT INTO entries(id,session_id,owner_id,kind,body,sequence,created_at,edited_at) VALUES(?,?,?,?,?,?,?,NULL)').run(entryId,sessionId,user.id,kind,text,seq,timestamp);
          logEvent(user.id, 'session.entry_create', sessionId);
          return sendJson(res, 201, { entry: db.prepare('SELECT id,kind,body,sequence,created_at,edited_at FROM entries WHERE id=?').get(entryId) });
        }
        if (resource === 'entries' && childId && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['kind','body']); requireInProgress(row);
          const existing = db.prepare('SELECT * FROM entries WHERE id=? AND session_id=? AND owner_id=?').get(childId,user.id === row.owner_id ? sessionId : '',user.id);
          if (!existing) fail(404, 'NOT_FOUND', 'That entry was not found.');
          const kind = body.kind === undefined ? existing.kind : body.kind;
          if (!ENTRY_KINDS.includes(kind)) fail(400, 'VALIDATION_ERROR', 'Choose a valid entry type.', { kind: 'Choose a valid entry type.' });
          const text = body.body === undefined ? existing.body : field(body, 'body', LIMITS.entryBody, { required: true });
          const timestamp = nowIso(); db.prepare('UPDATE entries SET kind=?,body=?,edited_at=? WHERE id=? AND session_id=? AND owner_id=?').run(kind,text,timestamp,childId,sessionId,user.id);
          return sendJson(res, 200, { entry: db.prepare('SELECT id,kind,body,sequence,created_at,edited_at FROM entries WHERE id=?').get(childId) });
        }
        if (resource === 'entries' && childId && method === 'DELETE') {
          requireInProgress(row); const result = db.prepare('DELETE FROM entries WHERE id=? AND session_id=? AND owner_id=?').run(childId,sessionId,user.id);
          if (!result.changes) fail(404, 'NOT_FOUND', 'That entry was not found.'); return sendJson(res, 200, { deleted: true });
        }
        if (resource === 'terms' && method === 'GET') return sendJson(res, 200, { terms: getWorkspace(user, sessionId).terms });
        if (resource === 'terms' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['sourceTerm','targetTerm','contextRegister']); requireEditable(row);
          const source = field(body,'sourceTerm',LIMITS.termField,{required:true}); const target = field(body,'targetTerm',LIMITS.termField,{required:true}); const context = field(body,'contextRegister',LIMITS.termContext);
          const timestamp = nowIso(); const termId = id();
          db.prepare('INSERT INTO terms(id,session_id,owner_id,source_term,target_term,context_register,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(termId,sessionId,user.id,source,target,context,timestamp,timestamp);
          logEvent(user.id, 'session.term_create', sessionId); return sendJson(res, 201, { term: db.prepare('SELECT id,source_term AS sourceTerm,target_term AS targetTerm,context_register AS contextRegister,created_at AS createdAt,updated_at AS updatedAt FROM terms WHERE id=?').get(termId) });
        }
        if (resource === 'terms' && childId && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['sourceTerm','targetTerm','contextRegister']); requireEditable(row);
          const term = db.prepare('SELECT * FROM terms WHERE id=? AND session_id=? AND owner_id=?').get(childId,sessionId,user.id);
          if (!term) fail(404, 'NOT_FOUND', 'That term was not found.');
          const source = body.sourceTerm === undefined ? term.source_term : field(body,'sourceTerm',LIMITS.termField,{required:true});
          const target = body.targetTerm === undefined ? term.target_term : field(body,'targetTerm',LIMITS.termField,{required:true});
          const context = body.contextRegister === undefined ? term.context_register : field(body,'contextRegister',LIMITS.termContext);
          const timestamp = nowIso(); db.prepare('UPDATE terms SET source_term=?,target_term=?,context_register=?,updated_at=? WHERE id=? AND session_id=? AND owner_id=?').run(source,target,context,timestamp,childId,sessionId,user.id);
          return sendJson(res, 200, { term: db.prepare('SELECT id,source_term AS sourceTerm,target_term AS targetTerm,context_register AS contextRegister,created_at AS createdAt,updated_at AS updatedAt FROM terms WHERE id=?').get(childId) });
        }
        if (resource === 'terms' && childId && method === 'DELETE') {
          requireEditable(row); const result = db.prepare('DELETE FROM terms WHERE id=? AND session_id=? AND owner_id=?').run(childId,sessionId,user.id);
          if (!result.changes) fail(404, 'NOT_FOUND', 'That term was not found.'); return sendJson(res, 200, { deleted: true });
        }
        if (resource === 'followups' && method === 'GET') return sendJson(res, 200, { followups: getWorkspace(user, sessionId).followups });
        if (resource === 'followups' && method === 'POST') {
          const body = await readJson(req); rejectUnknown(body, ['text']); requireEditable(row);
          const text = field(body,'text',LIMITS.followupText,{required:true}); const timestamp = nowIso(); const followupId = id();
          db.prepare('INSERT INTO followups(id,session_id,owner_id,text,status,created_at,resolved_at,updated_at) VALUES(?,?,?,? ,\'open\',?,NULL,?)').run(followupId,sessionId,user.id,text,timestamp,timestamp);
          logEvent(user.id, 'session.followup_create', sessionId); return sendJson(res, 201, { followup: getWorkspace(user, sessionId).followups.find(item => item.id === followupId) });
        }
        if (resource === 'followups' && childId && method === 'PATCH') {
          const body = await readJson(req); rejectUnknown(body, ['text','status']);
          const item = db.prepare('SELECT * FROM followups WHERE id=? AND session_id=? AND owner_id=?').get(childId,sessionId,user.id);
          if (!item) fail(404, 'NOT_FOUND', 'That follow-up was not found.');
          if (body.text !== undefined) requireEditable(row);
          if (row.status === 'cancelled') fail(409, 'SESSION_READ_ONLY', 'A cancelled session is read-only.');
          const text = body.text === undefined ? item.text : field(body,'text',LIMITS.followupText,{required:true});
          const status = body.status === undefined ? item.status : body.status;
          if (!['open','done'].includes(status)) fail(400, 'VALIDATION_ERROR', 'Choose open or done for follow-up status.');
          if (row.status === 'completed' && body.text !== undefined) fail(409, 'SESSION_READ_ONLY', 'Only follow-up status may change after completion.');
          const timestamp = nowIso(); const resolved = status === 'done' ? (item.status === 'done' ? item.resolved_at : timestamp) : null;
          db.prepare('UPDATE followups SET text=?,status=?,resolved_at=?,updated_at=? WHERE id=? AND session_id=? AND owner_id=?').run(text,status,resolved,timestamp,childId,sessionId,user.id);
          logEvent(user.id, 'session.followup_update', sessionId); return sendJson(res, 200, { followup: getWorkspace(user, sessionId).followups.find(f => f.id === childId) });
        }
        if (resource === 'followups' && childId && method === 'DELETE') {
          requireEditable(row); const result = db.prepare('DELETE FROM followups WHERE id=? AND session_id=? AND owner_id=?').run(childId,sessionId,user.id);
          if (!result.changes) fail(404, 'NOT_FOUND', 'That follow-up was not found.'); return sendJson(res, 200, { deleted: true });
        }
        if (resource === 'export' && method === 'GET') {
          if (row.status !== 'completed') fail(409, 'EXPORT_NOT_AVAILABLE', 'Finish the session before exporting its record.');
          const workspace = getWorkspace(user, sessionId); const format = url.searchParams.get('format') || 'json';
          const exportRecord = {
            schemaVersion: 1, exportedAt: nowIso(), session: workspace.session, preparation: workspace.preparation,
            prepChecks: workspace.prepChecks, entries: workspace.entries, terms: workspace.terms, followups: workspace.followups
          };
          if (format === 'json') {
            const content = JSON.stringify(exportRecord, null, 2);
            return send(res, 200, content, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${sessionId}.json"` });
          }
          if (format === 'markdown') {
            const escMd = text => String(text ?? '').replace(/([\\`*_{}\[\]<>()#+.!|>-])/g, '\\$1');
            const lines = [`# ${escMd(workspace.session.title)}`, '', `- Status: completed`, `- Client: ${escMd(workspace.session.clientLabel || 'Not recorded')}`, `- Languages: ${escMd(workspace.session.languageFrom)} → ${escMd(workspace.session.languageTo)}`, `- Scheduled: ${escMd(workspace.session.scheduledStartUtc)} (${escMd(workspace.session.timezone)})`, `- Started: ${escMd(workspace.session.startedAt)}`, `- Ended: ${escMd(workspace.session.endedAt)}`, `- Duration: ${workspace.session.durationSeconds} seconds`, '', '## Preparation', '', `**Goal**`, '', escMd(workspace.preparation.goal || 'No goal was recorded.'), '', '**Context**', '', escMd(workspace.preparation.context || 'No context was recorded.'), '', '**Instructions**', '', escMd(workspace.preparation.instructions || 'No instructions were recorded.'), '', '**Names and pronunciation**', '', escMd(workspace.preparation.namesPronunciation || 'None recorded.'), '', '**Tone / register**', '', escMd(workspace.preparation.toneRegister || 'None recorded.'), '', '**Open questions**', '', escMd(workspace.preparation.openQuestions || 'None recorded.'), '', '## Conversation and notes', ''];
            for (const entry of workspace.entries) lines.push(`### ${escMd(({source:'Source text',interpretation:'Interpreted text',note:'Note'})[entry.kind])}`, '', escMd(entry.body), '');
            lines.push('## Terminology', '');
            if (!workspace.terms.length) lines.push('No terms were recorded.', '');
            for (const term of workspace.terms) lines.push(`- ${escMd(term.sourceTerm)} → ${escMd(term.targetTerm)}${term.contextRegister ? ` — ${escMd(term.contextRegister)}` : ''}`);
            lines.push('', '## Follow-ups', '');
            if (!workspace.followups.length) lines.push('No follow-ups were recorded.', '');
            for (const followup of workspace.followups) lines.push(`- [${followup.status === 'done' ? 'x' : ' '}] ${escMd(followup.text)}`);
            lines.push('', '## Session summary', '', escMd(workspace.session.completionSummary || 'No summary was recorded.'), '');
            return send(res, 200, lines.join('\n'), { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${sessionId}.md"` });
          }
          fail(400, 'INVALID_EXPORT_FORMAT', 'Choose JSON or Markdown for export.');
        }
      }

      fail(404, 'NOT_FOUND', 'That API route was not found.');
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof HttpError) {
        if (error.status === 429 && !res.hasHeader('Retry-After')) res.setHeader('Retry-After', '60');
        const envelope = { error: { code: error.code, message: error.message, requestId } };
        if (error.fieldErrors) envelope.error.fieldErrors = error.fieldErrors;
        sendJson(res, error.status, envelope);
        return;
      }
      console.error(`[${requestId}] Request failed: ${error?.name || 'Error'}`);
      sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Retry the action. The request ID is included for local troubleshooting.', requestId } });
    }
  });

  async function serveStatic(pathname, res, requestId) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { fail(400, 'INVALID_PATH', 'The path is invalid.'); }
    if (decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) fail(404, 'NOT_FOUND', 'That page was not found.');
    if (decoded === '/sample' || decoded === '/sample/') decoded = '/sample.html';
    if (decoded === '/') decoded = '/index.html';
    const assetRoot = resolve(root, 'client/src');
    const isAsset = decoded.startsWith('/assets/');
    const selectedRoot = isAsset ? assetRoot : publicRoot;
    const relativePath = isAsset ? decoded.slice('/assets'.length) : decoded;
    const candidate = resolve(selectedRoot, `.${relativePath}`);
    if (!(candidate === selectedRoot || candidate.startsWith(selectedRoot + sep))) fail(404, 'NOT_FOUND', 'That page was not found.');
    let target = candidate;
    try {
      const info = await stat(target);
      if (!info.isFile()) fail(404, 'NOT_FOUND', 'That page was not found.');
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (extname(decoded)) fail(404, 'NOT_FOUND', 'That file was not found.');
      target = join(publicRoot, 'index.html');
    }
    const data = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': type, 'X-Request-ID': requestId, 'Cache-Control': 'no-cache' });
  }

  const server = createServerInstance;
  server.on('close', () => clearInterval(pruneTimer));
  server.cadenceDb = db;
  server.cadenceDbPath = actualDbPath;
  server.cadenceRoot = root;
  server.listenPort = port;
  return server;
}

