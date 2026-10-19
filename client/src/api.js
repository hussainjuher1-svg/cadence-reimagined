function csrfCookie() {
  const hit = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('cadence_csrf='));
  return hit ? decodeURIComponent(hit.slice('cadence_csrf='.length)) : '';
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || payload?.message || `Request failed (${status}).`);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code || 'REQUEST_FAILED';
    this.fieldErrors = payload?.error?.fieldErrors || {};
    this.requestId = payload?.error?.requestId || '';
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const initHeaders = new Headers(headers);
  const verb = method.toUpperCase();
  if (body !== undefined) initHeaders.set('Content-Type', 'application/json');
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(verb)) initHeaders.set('X-CSRF-Token', csrfCookie());
  const response = await fetch(path, {
    method: verb,
    headers: initHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(response.status, typeof payload === 'object' ? payload : { message: payload });
  return { payload, response };
}

export const api = {
  async get(path, options) { return (await request(path, options)).payload; },
  async post(path, body, options = {}) { return (await request(path, { ...options, method: 'POST', body, headers: { ...(options.headers || {}) } })).payload; },
  async postIdempotent(path, body, key = crypto.randomUUID()) {
    return (await request(path, { method: 'POST', body, headers: { 'Idempotency-Key': key } })).payload;
  },
  async patch(path, body, options) { return (await request(path, { ...options, method: 'PATCH', body })).payload; },
  async delete(path, body) { return (await request(path, { method: 'DELETE', body })).payload; },
  async download(path, fallbackName) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const type = response.headers.get('content-type') || '';
      let payload = {};
      try { payload = type.includes('application/json') ? await response.json() : { message: await response.text() }; } catch { /* retain generic error */ }
      throw new ApiError(response.status, payload);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The server returned an empty export. No download was created.');
    const header = response.headers.get('content-disposition') || '';
    const filename = header.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.hidden = true;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    return { filename, bytes: blob.size };
  },
};
