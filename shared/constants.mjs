export const APP_NAME = 'Cadence';
export const SESSION_STATUSES = Object.freeze(['scheduled', 'in_progress', 'completed', 'cancelled']);
export const ENTRY_KINDS = Object.freeze(['source', 'interpretation', 'note']);
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
export const LIMITS = Object.freeze({
  requestBytes: 100 * 1024,
  sessionTitle: 200,
  clientLabel: 160,
  entryBody: 5000,
  termField: 200,
  termContext: 500,
  followupText: 1000,
  summary: 4000,
  pageSize: 50,
  sessionIdleMs: 7 * 24 * 60 * 60 * 1000,
  sessionAbsoluteMs: 30 * 24 * 60 * 60 * 1000,
  resetTokenMs: 30 * 60 * 1000,
});
