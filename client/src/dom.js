export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const attr = esc;
export const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
export const formatDate = (iso, zone) => {
  if (!iso) return 'Not set';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone || undefined, timeZoneName: 'short' }).format(new Date(iso)); }
  catch { return new Date(iso).toISOString(); }
};
export const formatShortDate = iso => iso ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso)) : 'Not set';
export const formatDuration = seconds => {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return 'Not recorded';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
};
export const languageName = tag => ({ en: 'English', es: 'Spanish', fr: 'French', ar: 'Arabic', bn: 'Bangla', zh: 'Chinese', de: 'German', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', hi: 'Hindi', it: 'Italian' })[tag] || tag || 'Not set';
export const languageOptions = selected => ['en','es','fr','ar','bn','zh','de','pt','ru','ja','hi','it'].map(tag => `<option value="${tag}" ${tag === selected ? 'selected' : ''}>${languageName(tag)}</option>`).join('');
export const link = (hash, label, cls = '') => `<a class="${cls}" href="#${hash}">${label}</a>`;
export const statusBadge = status => {
  const label = ({ scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' })[status] || 'Unknown status';
  return `<span class="status status--${esc(status)}"><span class="status__mark" aria-hidden="true"></span>${label}</span>`;
};
export const icon = name => ({
  arrow: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11M10 5l5 5-5 5"/></svg>',
  plus: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>',
  check: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m4 10 4 4 8-8"/></svg>',
  calendar: '<svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="12" rx="2"/><path d="M6 3v4M14 3v4M3 9h14"/></svg>',
  download: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3v9m-4-4 4 4 4-4M4 15v2h12v-2"/></svg>',
  trash: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2m2 0-.7 10H6.7L6 6m2.5 3v4m3-4v4"/></svg>',
  close: '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg>'
})[name] || '';
export const button = (label, action, cls = 'button button--secondary', extra = '') => `<button type="button" class="${cls}" data-action="${attr(action)}" ${extra}>${label}</button>`;
export const field = ({ label, name, value = '', type = 'text', required = false, hint = '', maxLength, attrs = '', autocomplete = '', options = '' }) => {
  const requiredAttr = required ? 'required' : '';
  const maxlength = maxLength ? `maxlength="${maxLength}"` : '';
  const auto = autocomplete ? `autocomplete="${autocomplete}"` : '';
  const hintHtml = hint ? `<p class="field-hint" id="hint-${attr(name)}">${esc(hint)}</p>` : '';
  const common = `id="field-${attr(name)}" name="${attr(name)}" ${requiredAttr} ${maxlength} ${auto} dir="auto" lang="und" ${attrs} aria-describedby="${hint ? `hint-${attr(name)} ` : ''}error-${attr(name)}"`;
  const control = options ? `<select ${common}>${options}</select>` : type === 'textarea' ? `<textarea ${common}>${esc(value)}</textarea>` : `<input type="${attr(type)}" ${common} value="${attr(value)}">`;
  return `<div class="field"><label for="field-${attr(name)}">${esc(label)}${required ? '<span aria-hidden="true"> *</span>' : ''}</label>${control}${hintHtml}<p class="field-error" id="error-${attr(name)}" data-error-for="${attr(name)}"></p></div>`;
};
export const submitButton = (label, extraClass = '') => `<button class="button button--primary ${extraClass}" type="submit">${label}</button>`;
