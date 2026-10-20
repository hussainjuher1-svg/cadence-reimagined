import { api, ApiError } from './api.js';
import { esc, attr, localZone, formatDate, formatShortDate, formatDuration, languageName, languageOptions, statusBadge, icon, button, field, submitButton } from './dom.js';
import { analyzeRehearsalText, formatRehearsalNotes } from './rehearsal.js';
import { assistantAnswer, ASSISTANT_PROMPTS } from './assistant.js';

const root = document.querySelector('#app');
let currentUser = null;
let activeWorkspace = null;
let activeTab = 'stream';
let routeController = null;
let timerHandle = null;
let timerOffsetMs = 0;
let selectedToast = null;
let activeRehearsalNotes = '';
let activeRehearsalScan = null;
let activeAssistantMessages = [];
let routeGeneration = 0;
let demoCapturing = false;
let demoPaused = false;
let demoEnded = false;
let demoTerms = [
  { source: 'follow-up appointment', target: 'ফলো-আপ অ্যাপয়েন্টমেন্ট', note: 'Community health · reviewed' },
  { source: 'dosage', target: 'ওষুধের মাত্রা', note: 'Clinical · verify context' },
  { source: 'allergic reaction', target: 'অ্যালার্জিজনিত প্রতিক্রিয়া', note: 'Clinical · reviewed' }
];
let demoAssistantMessages = [{ role: 'assistant', text: '“Take one tablet twice daily” describes frequency, but the exact timing may depend on the prescription. Preserve the wording and verify any ambiguity with the speaker or authorized source.' }];

function routeParts() {
  const raw = location.hash.slice(1) || '/';
  const url = new URL(raw, 'https://cadence.local');
  return { path: url.pathname || '/', query: url.searchParams };
}
function go(path) { location.hash = path.startsWith('/') ? `#${path}` : `#/${path}`; }
function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }
function startTimer(session, serverNow) {
  stopTimer();
  const element = document.querySelector('[data-live-timer]');
  if (!element || !session.startedAt || session.status !== 'in_progress') return;
  timerOffsetMs = Date.parse(serverNow) - Date.now();
  const started = Date.parse(session.startedAt);
  const update = () => { const seconds = Math.max(0, Math.floor((Date.now() + timerOffsetMs - started) / 1000)); element.textContent = formatDuration(seconds); };
  update(); timerHandle = setInterval(update, 1000);
}
function toast(message, kind = 'success') {
  selectedToast = { message, kind };
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast toast--${kind}`;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const text = document.createElement('p'); text.textContent = message;
  const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss message'); close.innerHTML = icon('close');
  close.addEventListener('click', () => { selectedToast = null; node.remove(); });
  node.append(text, close); document.body.append(node);
}
function clearToast() { selectedToast = null; document.querySelector('.toast')?.remove(); }
function renderWithToast(html) { root.innerHTML = html; root.setAttribute('aria-busy', 'false'); if (selectedToast) toast(selectedToast.message, selectedToast.kind); }
function pageError(message, retry = true) {
  return `<section class="error-state" role="alert"><strong>Something did not load.</strong><p>${esc(message)}</p>${retry ? button('Try again', 'retry', 'button button--secondary button--small') : ''}</section>`;
}
function localNotice() { return `<div class="local-mode-strip">Local development mode — accounts are stored in a database file on this computer. This is not production authentication.</div>`; }
function publicNav() { return `<header class="public-header"><a class="wordmark" href="#/" aria-label="Cadence home">Cadence</a><nav class="header-links" aria-label="Main navigation"><a class="text-link" href="#/signin">Sign in</a><a class="button button--primary" href="#/signup">Create account</a></nav></header>`; }
function publicFooter() { return `<footer class="public-footer"><div class="public-footer__inner"><a class="wordmark" href="#/">Cadence</a><span>Built for careful work, one session at a time.</span><a href="/sample">Explore sample workspace</a></div></footer>`; }
function appHeader() {
  return `<div class="app-topbar"><header class="app-header"><a class="wordmark" href="#/app" aria-label="Cadence dashboard">Cadence</a><div class="app-header__right"><nav class="header-links" aria-label="Workspace navigation"><a class="text-link" href="#/app">Dashboard</a><a class="text-link" href="#/settings">Settings</a></nav><span class="user-label">${esc(currentUser?.displayName || '')}</span><button class="button button--quiet button--small" type="button" data-action="signout">Sign out</button></div></header></div>${localNotice()}`;
}
function appShell(content, { footer = true } = {}) {
  return `<div class="app-shell">${appHeader()}<main id="main-content" class="main-layout" tabindex="-1">${content}</main>${footer ? '<footer class="app-footer">Cadence local workspace · Your data stays in this local database file.</footer>' : ''}</div>`;
}
function homeView() {
  const cta = currentUser?.onboardingCompletedAt ? '<a class="button button--primary" href="#/app">Open your workspace</a>' : '<a class="button button--primary" href="#/signup">Create your workspace</a>';
  return `${publicNav()}<main id="main-content">
    <section class="hero"><div class="hero__inner">
      <div class="hero__copy">
        <p class="hero__eyebrow">PREPARE FOR THE DIFFICULT PARTS</p>
        <h1>Know what to rehearse before the assignment starts.</h1>
        <p class="hero__lead">Cadence helps interpreters review dense source text, spot figures and acronyms, and prepare focused rehearsal notes before a session.</p>
        <div class="header-actions">${cta}<a class="button button--secondary" href="/sample">Explore the sample workspace</a><a class="button button--secondary" href="#/live-demo">Preview interpreter workspace</a></div>
        <p class="hero__note">Local, rules-based text review. No microphone capture, live transcription or automatic interpretation.</p>
      </div>
      <aside class="hero__visual" aria-label="Illustration of Cadence's preparation review">
        <div class="workflow-card">
          <div class="workflow-card__top"><span class="workflow-card__label">PREPARATION REVIEW</span><span class="workflow-card__hint">Before the session</span></div>
          <div class="workflow-card__heading"><div><h2>Four things to check.</h2><p>Review what deserves attention, then use your own judgement.</p></div></div>
          <ol class="workflow-list">
            <li class="workflow-row"><span class="workflow-row__number">01</span><div class="workflow-row__copy"><strong>Long or complex sentences</strong><span>Practice the main claim, conditions and contrast</span></div></li>
            <li class="workflow-row"><span class="workflow-row__number">02</span><div class="workflow-row__copy"><strong>Figures and measurements</strong><span>Check the exact value, unit and comparison</span></div></li>
            <li class="workflow-row"><span class="workflow-row__number">03</span><div class="workflow-row__copy"><strong>Acronyms and names</strong><span>Verify expansion, pronunciation and context</span></div></li>
            <li class="workflow-row"><span class="workflow-row__number">04</span><div class="workflow-row__copy"><strong>Unresolved questions</strong><span>Record what still needs confirming</span></div></li>
          </ol>
          <div class="workflow-card__foot">Review every flag yourself; the scan does not interpret meaning.</div>
        </div>
      </aside>
    </div></section>
    <section class="public-section"><p class="eyebrow">A SPECIFIC JOB, NOT ANOTHER CHATBOT</p><h2>Prepare → Rehearse → Record</h2><p class="public-section__intro">Cadence is focused on the preparation work around a session. It does not attempt to replace the interpreter during live delivery.</p><div class="steps"><article class="step"><span class="step__number">01 / PREPARE</span><h3>Make the context usable</h3><p>Save assignment instructions, pronunciation notes, open questions and terminology in one session record.</p></article><article class="step"><span class="step__number">02 / REHEARSE</span><h3>Spot high-attention details</h3><p>Run a local scan for dense sentences, figures, units, acronyms and possible names. Review them before the assignment.</p></article><article class="step"><span class="step__number">03 / RECORD</span><h3>Keep the record honest</h3><p>Save manual notes, follow-ups and a closeout summary. Nothing is transcribed or interpreted automatically.</p></article></div></section>
    <section class="public-section"><p class="eyebrow">DESIGNED FOR TRUST</p><h2>Useful cues, not false certainty.</h2><div class="capabilities"><article class="capability"><h3>Transparent flags</h3><p>Each rehearsal flag is a simple text-pattern heuristic, not a claim that a sentence or term is wrong.</p></article><article class="capability"><h3>Your judgement stays central</h3><p>Cadence can help structure preparation; only the interpreter decides what is accurate and relevant.</p></article><article class="capability"><h3>Portable working records</h3><p>Keep session-specific notes, terminology and follow-ups, and export the saved record in JSON or Markdown.</p></article></div></section>
    <section class="public-section"><div class="trust-row"><div><p class="eyebrow">LOCAL BY DESIGN</p><h2>Review text in your browser.</h2><p>The rehearsal scan runs locally in the browser and does not send the pasted source text to an AI service. Notes are saved to the local database only when you choose to add them to preparation and select Save preparation.</p></div><div class="trust-detail"><p>This is a local development release, not production security. Do not enter sensitive or restricted client material unless you have permission and the storage arrangement is appropriate.</p></div></div></section>
    <section class="public-section"><h2>Make preparation more deliberate.</h2><p class="public-section__intro">Start with one assignment. Paste permitted source text into Preparation Review, examine the flags, and save only the notes that are useful.</p>${cta}</section>
  </main>${publicFooter()}`;
}
function authView(kind, params = new URLSearchParams()) {
  const isSignin = kind === 'signin'; const isSignup = kind === 'signup'; const isForgot = kind === 'forgot'; const isReset = kind === 'reset';
  const title = isSignin ? 'Sign in to your workspace.' : isSignup ? 'Start with a clear workspace.' : isForgot ? 'Reset your password.' : 'Choose a new password.';
  const lead = isSignin ? 'Return to the sessions and records you saved.' : isSignup ? 'Create a local account. Nothing is preloaded with sample client data.' : isForgot ? 'Start a local password-recovery request.' : 'Use the reset link from your local development outbox.';
  let form = '';
  if (isSignin) form = `<form data-form="signin" novalidate>${field({ label: 'Email address', name: 'email', type: 'email', required: true, autocomplete: 'email', maxLength: 254 })}${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 })}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Sign in', 'button--block')}</div><div class="form-footer"><a href="#/forgot">Forgot password?</a><a href="#/signup">Create account</a></div></form>`;
  if (isSignup) form = `<form data-form="signup" novalidate>${field({ label: 'Your name', name: 'displayName', required: true, maxLength: 80, autocomplete: 'name', hint: '1–80 characters.' })}${field({ label: 'Email address', name: 'email', type: 'email', required: true, maxLength: 254, autocomplete: 'email' })}${field({ label: 'Password', name: 'password', type: 'password', required: true, maxLength: 128, autocomplete: 'new-password', hint: 'Use 10–128 characters. Common passwords are blocked; pasting and password managers are supported.' })}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Create account', 'button--block')}</div><p class="auth-card__footer">Already have an account? <a href="#/signin">Sign in</a></p></form>`;
  if (isForgot) form = `<form data-form="forgot" novalidate>${field({ label: 'Email address', name: 'email', type: 'email', required: true, maxLength: 254, autocomplete: 'email' })}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Request reset link', 'button--block')}</div><p class="auth-card__footer">Local mode writes a reset link to the server terminal and <code>data/dev-outbox.jsonl</code>. No email is sent.</p><p class="auth-card__footer"><a href="#/signin">Back to sign in</a></p></form>`;
  if (isReset) form = `<form data-form="reset" novalidate><input type="hidden" name="token" value="${attr(params.get('token') || '')}">${field({ label: 'New password', name: 'password', type: 'password', required: true, maxLength: 128, autocomplete: 'new-password', hint: 'Use 10–128 characters.' })}${field({ label: 'Confirm new password', name: 'confirmPassword', type: 'password', required: true, maxLength: 128, autocomplete: 'new-password' })}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Update password', 'button--block')}</div><p class="auth-card__footer"><a href="#/signin">Back to sign in</a></p></form>`;
  return `${publicNav()}<main id="main-content" class="auth-layout"><section class="auth-copy"><p class="eyebrow">CADENCE / LOCAL WORKSPACE</p><h1>${title}</h1><p>${lead}</p><p>Cadence keeps the interpreter in control: your own preparation, your own notes, your own closeout.</p></section><section class="auth-card"><h2>${isSignin ? 'Welcome back' : isSignup ? 'Create an account' : isForgot ? 'Account recovery' : 'Set a new password'}</h2><p class="local-notice">Local development mode — accounts are stored in a database file on this computer. This is not production authentication.</p>${form}</section></main>${publicFooter()}`;
}
function onboardingView() {
  const zone = currentUser?.defaultTimezone && currentUser.defaultTimezone !== 'UTC' ? currentUser.defaultTimezone : localZone();
  return appShell(`<div class="page-heading"><div><p class="eyebrow">A SHORT SETUP</p><h1>Welcome to Cadence.</h1><p>Cadence supports preparation, local text-pattern review and manual session records. It does not transcribe or interpret live speech. Set a few defaults; you can change them later.</p></div></div><section class="panel panel--medium"><form data-form="onboarding" novalidate><div class="grid-2">${field({ label: 'Display name', name: 'displayName', value: currentUser?.displayName || '', required: true, maxLength: 80, autocomplete: 'name' })}${field({ label: 'Default time zone', name: 'defaultTimezone', value: zone, required: true, maxLength: 80, hint: 'Use an IANA name, for example Asia/Dhaka.' })}${field({ label: 'Default source language', name: 'defaultLanguageFrom', options: `<option value="">Choose later</option>${languageOptions(currentUser?.defaultLanguageFrom)}` })}${field({ label: 'Default target language', name: 'defaultLanguageTo', options: `<option value="">Choose later</option>${languageOptions(currentUser?.defaultLanguageTo)}` })}</div><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save and continue')}<a class="button button--secondary" href="/sample">Explore sample workspace</a></div></form></section>`, { footer: true });
}
function pageHeading(eyebrow, title, description = '', actions = '') {
  return `<div class="page-heading"><div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${actions ? `<div class="page-heading__actions">${actions}</div>` : ''}</div>`;
}
function liveWorkspaceDemoView() {
  const sourceLanguage = document.querySelector('#demo-source-language')?.value || 'en';
  const targetLanguage = document.querySelector('#demo-target-language')?.value || 'bn';
  const sourceName = languageName(sourceLanguage);
  const targetName = languageName(targetLanguage);
  const terms = demoTerms.map((term, index) => `<article class="demo-term-row" data-term-search="${attr(`${term.source} ${term.target} ${term.note}`.toLocaleLowerCase())}"><div class="demo-term-row__copy"><strong>${esc(term.source)}</strong><span lang="bn" dir="auto">${esc(term.target)}</span><small>${esc(term.note)}</small></div><button class="button button--quiet button--small" type="button" data-action="demo-remove-term" data-index="${index}" aria-label="Remove ${attr(term.source)}">Remove</button></article>`).join('');
  const messages = demoAssistantMessages.map(message => `<div class="demo-chat-message ${message.role === 'user' ? 'demo-chat-message--user' : ''}"><span class="demo-chat-message__label">${message.role === 'user' ? 'YOU' : 'CADENCE ASSISTANT'}</span><p>${esc(message.text)}</p></div>`).join('');
  return `<div class="demo-app">
    <header class="demo-topbar"><a class="demo-brand" href="#/" aria-label="Cadence home"><span class="demo-brand__mark">C</span><span>cadence</span></a><div class="demo-topbar__session"><span class="demo-session-dot ${demoEnded ? 'demo-session-dot--muted' : ''}"></span><div><strong>Community health consultation</strong><span>Interpreter workspace · Sample session</span></div></div><div class="demo-topbar__actions"><span class="demo-clock">12:48</span><a class="button button--quiet button--small" href="#/app">Exit preview</a></div></header>
    <div class="demo-preview-notice"><span><strong>UI PREVIEW</strong> — All speech, translation and assistant responses are sample content. No microphone or AI service is connected.</span><a href="#/app">Back to Cadence</a></div>
    <div class="demo-layout">
      <aside class="demo-sidebar" aria-label="Workspace navigation"><div class="demo-sidebar__label">WORKSPACE</div><a class="demo-nav-item demo-nav-item--active" href="#/live-demo"><span>▤</span> Live workspace</a><a class="demo-nav-item" href="#/app"><span>▦</span> Sessions</a><a class="demo-nav-item" href="#/live-demo#terms"><span>⌕</span> Terminology</a><a class="demo-nav-item" href="#/app"><span>◷</span> Session history</a><div class="demo-sidebar__bottom"><div class="demo-privacy"><span class="demo-privacy__icon">✓</span><div><strong>Privacy first</strong><span>Preview only · no audio saved</span></div></div><div class="demo-profile"><span class="demo-avatar">IM</span><div><strong>Interpreter</strong><span>Workspace preview</span></div><span class="demo-profile__dots">···</span></div></div></aside>
      <main class="demo-main" id="main-content">
        <div class="demo-heading"><div><p class="eyebrow">LIVE INTERPRETER WORKSPACE</p><h1>Stay with the conversation.</h1><p>Speech support, terminology and context in one focused view.</p></div><div class="demo-session-actions"><span class="demo-session-status ${demoEnded ? 'demo-session-status--ended' : demoPaused ? 'demo-session-status--paused' : 'demo-session-status--ready'}"><span></span>${demoEnded ? 'Session ended' : demoPaused ? 'Paused' : demoCapturing ? 'Capture preview on' : 'Ready to begin'}</span><button type="button" class="button button--secondary button--small" data-action="demo-pause" ${demoEnded ? 'disabled' : ''}>${demoPaused ? 'Resume' : 'Pause'}</button><button type="button" class="button button--danger button--small" data-action="demo-end" ${demoEnded ? 'disabled' : ''}>End session</button></div></div>
        <section class="demo-language-bar" aria-label="Language direction"><div class="demo-language-field"><label for="demo-source-language">SOURCE LANGUAGE</label><select id="demo-source-language" name="demo-source-language"><option value="en" ${sourceLanguage==='en'?'selected':''}>English</option><option value="bn" ${sourceLanguage==='bn'?'selected':''}>Bangla</option><option value="es" ${sourceLanguage==='es'?'selected':''}>Spanish</option><option value="ar" ${sourceLanguage==='ar'?'selected':''}>Arabic</option><option value="fr" ${sourceLanguage==='fr'?'selected':''}>French</option></select></div><button class="demo-swap" type="button" data-action="demo-swap" aria-label="Swap source and target languages">⇄</button><div class="demo-language-field"><label for="demo-target-language">TARGET LANGUAGE</label><select id="demo-target-language" name="demo-target-language"><option value="bn" ${targetLanguage==='bn'?'selected':''}>Bangla</option><option value="en" ${targetLanguage==='en'?'selected':''}>English</option><option value="es" ${targetLanguage==='es'?'selected':''}>Spanish</option><option value="ar" ${targetLanguage==='ar'?'selected':''}>Arabic</option><option value="fr" ${targetLanguage==='fr'?'selected':''}>French</option></select></div><div class="demo-capture-control"><span class="demo-mic-status ${demoCapturing && !demoPaused && !demoEnded ? 'demo-mic-status--active' : ''}"></span><span>${demoEnded ? 'Session closed' : demoPaused ? 'Capture paused' : demoCapturing ? 'Preview capture active' : 'Microphone not connected'}</span><button type="button" class="button ${demoCapturing && !demoPaused ? 'button--secondary' : 'button--primary'} button--small" data-action="demo-toggle-capture" ${demoEnded ? 'disabled' : ''}>${demoCapturing && !demoPaused ? 'Stop preview' : 'Start preview'}</button></div></section>
        <div class="demo-content-grid">
          <div class="demo-primary-column">
            <section class="demo-transcript-grid" aria-label="Transcript panels">
              <article class="demo-panel demo-transcript-panel"><div class="demo-panel__header"><div><span class="demo-panel__kicker">01 / SOURCE</span><h2>Original speech</h2></div><span class="demo-live-tag"><span></span> Sample</span></div><div class="demo-transcript-meta"><span>${esc(sourceName)}</span><span>·</span><span>Speaker 1</span><button type="button" class="demo-icon-button" data-action="demo-copy-original" aria-label="Copy original transcript">⧉</button></div><div class="demo-transcript-body" id="demo-original-text" lang="en"><p class="demo-timestamp">00:12</p><p>Before we confirm the appointment, I want to make sure you understand how to take the medicine.</p><p class="demo-timestamp">00:19</p><p>Please take <mark>one tablet twice daily</mark>, and return on <mark>November 18</mark> for a follow-up.</p><p class="demo-transcript-partial"><span></span> Sample segment · not live audio</p></div><div class="demo-panel__footer"><span>Sample transcript · not from a microphone</span><span>2 segments</span></div></article>
              <article class="demo-panel demo-transcript-panel demo-translation-panel"><div class="demo-panel__header"><div><span class="demo-panel__kicker">02 / TRANSLATION</span><h2>Translation draft</h2></div><span class="demo-draft-tag">Review draft</span></div><div class="demo-transcript-meta"><span>${esc(targetName)}</span><span>·</span><span>Suggested wording</span><button type="button" class="demo-icon-button" data-action="demo-copy-translation" aria-label="Copy translation draft">⧉</button></div><div class="demo-transcript-body" id="demo-translation-text" lang="bn" dir="auto"><p class="demo-timestamp">00:12 · Draft</p><p>অ্যাপয়েন্টমেন্ট নিশ্চিত করার আগে, আমি নিশ্চিত হতে চাই যে আপনি ওষুধটি কীভাবে খেতে হবে তা বুঝেছেন।</p><p class="demo-timestamp">00:19 · Draft</p><p>অনুগ্রহ করে দিনে দুবার একটি করে ট্যাবলেট নিন এবং পরবর্তী সাক্ষাতের জন্য ১৮ নভেম্বর ফিরে আসুন।</p><div class="demo-review-flag"><span>!</span><p><strong>Check before use</strong><br>Confirm the dosage wording and date format against the original.</p></div></div><div class="demo-panel__footer"><span>Draft only · verify meaning</span><button type="button" class="demo-text-button" data-action="demo-speak">Play sample audio <span aria-hidden="true">▷</span></button></div></article>
            </section>
            <section class="demo-panel demo-terms-panel" id="terms"><div class="demo-panel__header demo-terms-heading"><div><span class="demo-panel__kicker">SESSION REFERENCE</span><h2>Terminology</h2><p>Keep important wording close at hand.</p></div><button type="button" class="button button--secondary button--small" data-action="demo-add-term">${icon('plus')} Add term</button></div><div class="demo-term-tools"><label class="demo-search-field"><span aria-hidden="true">⌕</span><input type="search" id="demo-term-search" placeholder="Search this session's terms" aria-label="Search terminology"></label><span class="demo-term-count"><span id="demo-term-count">${demoTerms.length}</span> terms</span></div><div class="demo-term-list" id="demo-term-list">${terms || '<p class="demo-empty-terms">No terms yet. Add one for this session.</p>'}</div><form class="demo-add-term-form" data-form="demo-term" hidden><div class="demo-add-term-fields"><label>Source term<input name="source" required maxlength="120" placeholder="e.g. discharge summary"></label><label>Translation<input name="target" required maxlength="160" placeholder="Enter verified wording"></label></div><label class="demo-context-label">Context / source<input name="note" maxlength="160" placeholder="e.g. Clinic glossary · checked by interpreter"></label><div class="demo-add-term-actions"><button type="button" class="button button--quiet button--small" data-action="demo-cancel-term">Cancel</button><button type="submit" class="button button--primary button--small">Add to session</button></div></form></section>
          </div>
          <aside class="demo-assistant-column"><section class="demo-panel demo-assistant-panel"><div class="demo-assistant-heading"><div class="demo-assistant-avatar">C</div><div><h2>Cadence assistant</h2><p><span></span> Context support · sample mode</p></div><button type="button" class="demo-icon-button" data-action="demo-clear-assistant" aria-label="Clear assistant messages">↺</button></div><div class="demo-assistant-intro"><strong>A second pair of eyes, not a second interpreter.</strong><p>Ask about terminology, sentence structure or details worth checking.</p></div><div class="demo-assistant-prompts"><button type="button" data-action="demo-assist" data-prompt="numbers">Check numbers & dates</button><button type="button" data-action="demo-assist" data-prompt="phrase">Explain a phrase</button><button type="button" data-action="demo-assist" data-prompt="terms">Find terminology</button></div><div class="demo-chat-history" id="demo-chat-history">${messages}</div><form class="demo-assistant-form" data-form="demo-assistant"><label class="sr-only" for="demo-assistant-input">Ask Cadence assistant</label><textarea id="demo-assistant-input" name="message" rows="2" maxlength="600" placeholder="Ask about a term, phrase or ambiguity…" required></textarea><div class="demo-assistant-form__footer"><span>Sample replies · no AI connected</span><button class="button button--primary button--small" type="submit">Send <span aria-hidden="true">↗</span></button></div></form><p class="demo-assistant-disclaimer">Suggestions can be incomplete or wrong. Verify against approved sources and the speaker's meaning.</p></section><section class="demo-panel demo-session-tools"><div class="demo-panel__header"><div><span class="demo-panel__kicker">SESSION TOOLS</span><h2>Quick controls</h2></div></div><button type="button" class="demo-tool-row" data-action="demo-copy-original"><span class="demo-tool-icon">⧉</span><span><strong>Copy original transcript</strong><small>Copy sample text to clipboard</small></span><span>→</span></button><button type="button" class="demo-tool-row" data-action="demo-copy-translation"><span class="demo-tool-icon">⇢</span><span><strong>Copy translation draft</strong><small>Keep a review copy</small></span><span>→</span></button><div class="demo-session-note"><span>i</span><p><strong>Stay in control</strong><br>Use this UI preview to explore the workflow. It does not listen, translate or interpret real speech.</p></div></section></aside>
        </div>
        <footer class="demo-footer"><span>CADENCE · INTERPRETER WORKSPACE</span><span>Designed for careful work, not false certainty.</span></footer>
      </main>
    </div>
  </div>`;
}
function sessionMeta(session) {
  const parts = [`${languageName(session.languageFrom)} → ${languageName(session.languageTo)}`, session.clientLabel || 'Client not recorded', formatDate(session.scheduledStartUtc, session.timezone)];
  return `<div class="workspace-header-facts">${parts.map(x => `<span>${esc(x)}</span>`).join('')}</div>`;
}
function sessionRow(session, now) {
  const pastScheduled = session.status === 'scheduled' && Date.parse(session.scheduledStartUtc) < Date.parse(now);
  const href = session.status === 'completed' ? `#/sessions/${encodeURIComponent(session.id)}/summary` : `#/sessions/${encodeURIComponent(session.id)}`;
  const action = session.status === 'in_progress' ? 'Continue' : session.status === 'completed' ? 'Review' : session.status === 'cancelled' ? 'Open record' : 'Open';
  return `<li class="session-row"><div class="session-row__main"><a class="session-row__title" lang="und" dir="auto" href="${href}">${esc(session.title)}</a><p class="session-row__meta">${esc(formatDate(session.scheduledStartUtc, session.timezone))} · ${esc(languageName(session.languageFrom))} → ${esc(languageName(session.languageTo))}${session.clientLabel ? ` · ${esc(session.clientLabel)}` : ''}</p>${pastScheduled ? '<p class="attention-note">Not started — scheduled time has passed.</p>' : ''}</div><div class="session-row__right">${statusBadge(session.status)}<a class="button button--quiet button--small" href="${href}">${action} ${icon('arrow')}</a></div></li>`;
}
function sectionList(title, items, now, emptyCopy = 'Nothing here yet.') {
  if (!items.length) return `<section class="dashboard-section"><h2 class="section-title">${title}</h2><p class="section-subtitle">${emptyCopy}</p></section>`;
  return `<section class="dashboard-section"><h2 class="section-title">${title}</h2><div class="panel"><ul class="session-list">${items.map(item => sessionRow(item, now)).join('')}</ul></div></section>`;
}
function howToUseHtml(open = false) {
  return `<details class="quick-guide"${open ? ' open' : ''}><summary><span><strong>How to use Cadence</strong><span class="quick-guide__summary-note">A short guide for your first assignment</span></span></summary><div class="quick-guide__content"><ol class="quick-guide__steps"><li><strong>Create the assignment</strong><p>Choose New session and enter the title, language direction, time and time zone.</p></li><li><strong>Prepare the context</strong><p>Add instructions, names, pronunciation notes, terminology and unresolved questions.</p></li><li><strong>Rehearse the difficult parts</strong><p>Open Preparation Review and paste only material you are permitted to use. The local scan flags sentence, figure and acronym patterns; it does not translate.</p></li><li><strong>Record and review</strong><p>During the assignment, save manual notes only when practical. Afterward, finish the session and export the record if needed.</p></li></ol><p class="quick-guide__boundary"><strong>Important:</strong> Cadence does not listen to audio, generate live interpretation or verify translation accuracy. Avoid typing during moments when it would distract from listening.</p></div></details>`;
}
async function dashboardView() {
  const initial = `<div class="loading-state" role="status">Loading your saved sessions…</div>`;
  renderWithToast(appShell(`${pageHeading('YOUR WORKSPACE', `Good to see you, ${esc(currentUser?.displayName || 'interpreter')}.`, 'Here is what needs your attention next.', `<a class="button button--primary" href="#/sessions/new">${icon('plus')} New session</a>`)}${initial}`));
  try {
    const routeAtStart = location.hash;
    const response = await api.get('/api/v1/sessions?limit=50', { signal: routeController?.signal });
    if (routeAtStart !== location.hash) return;
    const sessions = response.sessions || []; const now = response.serverNow;
    const active = sessions.filter(s => s.status === 'in_progress');
    const future = sessions.filter(s => s.status === 'scheduled' && Date.parse(s.scheduledStartUtc) >= Date.parse(now)).sort((a,b) => Date.parse(a.scheduledStartUtc) - Date.parse(b.scheduledStartUtc));
    const pastScheduled = sessions.filter(s => s.status === 'scheduled' && Date.parse(s.scheduledStartUtc) < Date.parse(now)).sort((a,b) => Date.parse(a.scheduledStartUtc) - Date.parse(b.scheduledStartUtc));
    const nextSession = active[0] || future[0] || null;
    let prep = null;
    if (nextSession) {
      try { prep = await api.get(`/api/v1/sessions/${encodeURIComponent(nextSession.id)}/workspace`, { signal: routeController?.signal }); }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    if (routeAtStart !== location.hash) return;
    const nextHtml = nextSession ? `<section class="primary-session"><div><span class="primary-session__eyebrow">${active.length ? 'IN PROGRESS' : 'NEXT UP'}</span><h2>${esc(nextSession.title)}</h2><p>${esc(formatDate(nextSession.scheduledStartUtc, nextSession.timezone))} · ${esc(languageName(nextSession.languageFrom))} → ${esc(languageName(nextSession.languageTo))}${nextSession.clientLabel ? ` · ${esc(nextSession.clientLabel)}` : ''}</p>${prep ? `<p class="primary-session__prep">Preparation: ${prep.prepChecklist.filter(x => x.complete).length} of 5 ready${prep.prepChecklist.some(x => !x.complete) ? ` — missing: ${esc(prep.prepChecklist.filter(x => !x.complete).map(x => x.label.toLowerCase()).join(', '))}` : ''}.</p>` : ''}</div><div class="primary-session__action"><a class="button button--primary" href="#/sessions/${encodeURIComponent(nextSession.id)}">${active.length ? 'Continue session' : 'Open session'} ${icon('arrow')}</a></div></section>` : `<section class="primary-session primary-session--empty"><div><span class="primary-session__eyebrow">NEXT UP</span><h2>No upcoming session yet.</h2><p>Start with the details you know. Leave anything optional blank until you have it.</p></div><div class="primary-session__action"><a class="button button--primary" href="#/sessions/new">Create a session ${icon('arrow')}</a></div></section>`;
    const recent = sessions.filter(s => ['completed','cancelled'].includes(s.status)).sort((a,b) => Date.parse(b.endedAt || b.cancelledAt || b.updatedAt) - Date.parse(a.endedAt || a.cancelledAt || a.updatedAt)).slice(0,5);
    const upcoming = future.filter(s => s.id !== nextSession?.id).slice(0,5);
    const dashboard = `${pageHeading('YOUR WORKSPACE', `Good to see you, ${esc(currentUser?.displayName || 'interpreter')}.`, `Today is ${esc(new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeZone:currentUser?.defaultTimezone || undefined}).format(new Date(now)))}.`, `<a class="button button--primary" href="#/sessions/new">${icon('plus')} New session</a>`)}${howToUseHtml(sessions.length === 0)}${nextHtml}${pastScheduled.length ? sectionList('Needs attention', pastScheduled, now, 'Past scheduled times that have not been started appear here.') : ''}${sectionList('Upcoming', upcoming, now, 'Sessions you schedule will appear here.')}${sectionList('Recent work', recent, now, 'Completed and cancelled sessions will be kept here.')}`;
    renderWithToast(appShell(dashboard));
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401) { currentUser = null; go(`/signin?next=${encodeURIComponent('/app')}`); return; }
    renderWithToast(appShell(`${pageHeading('YOUR WORKSPACE','Your sessions','Your saved sessions could not be loaded.')} ${pageError(error.message)}`));
  }
}
function newSessionView() {
  const from = currentUser?.defaultLanguageFrom || '';
  const to = currentUser?.defaultLanguageTo || '';
  return appShell(`<p class="breadcrumb"><a href="#/app">Dashboard</a> / New session</p>${pageHeading('SESSION SETUP','Create a session','Start one record per assignment. Add preparation next, then review a permitted source-text excerpt before the session.') }<section class="panel panel--medium"><form data-form="session-create" novalidate><div class="grid-2">${field({ label: 'Session title', name: 'title', required: true, maxLength: 200, attrs: 'placeholder="Assignment title"' })}${field({ label: 'Client or assignment label', name: 'clientLabel', maxLength: 160, attrs: 'placeholder="Optional"' })}${field({ label: 'Source language', name: 'languageFrom', options: `<option value="">Choose language</option>${languageOptions(from)}`, required: true })}${field({ label: 'Target language', name: 'languageTo', options: `<option value="">Choose language</option>${languageOptions(to)}`, required: true })}${field({ label: 'Scheduled local date and time', name: 'scheduledStartLocal', type: 'datetime-local', required: true, hint: 'Enter the local date and time for this assignment.' })}${field({ label: 'Time zone', name: 'timezone', value: currentUser?.defaultTimezone || localZone(), required: true, maxLength: 80, hint: 'IANA time zone, such as Asia/Dhaka or Europe/Paris.' })}</div><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Create session')}<a class="button button--secondary" href="#/app">Cancel</a></div></form></section>`);
}
function checklistHtml(workspace) {
  return `<ul class="prep-checklist">${workspace.prepChecklist.map(item => `<li><span class="prep-checklist__mark ${item.complete ? 'prep-checklist__mark--done' : ''}" aria-hidden="true">${item.complete ? icon('check') : '·'}</span><div class="prep-checklist__text">${esc(item.label)}<div class="prep-checklist__state">${item.complete ? 'Complete' : 'Not complete'}</div>${['instructions_reviewed','questions_resolved'].includes(item.key) ? `<button class="link-button check-action" type="button" data-action="toggle-check" data-key="${attr(item.key)}" data-state="${item.complete ? 'pending' : (item.key === 'questions_resolved' && !workspace.preparation.openQuestions.trim() ? 'not_needed' : 'done')}">${item.complete ? 'Undo mark' : item.key === 'questions_resolved' && !workspace.preparation.openQuestions.trim() ? 'Mark none to resolve' : 'Mark complete'}</button>` : ''}${item.key === 'terminology_ready' && !item.complete ? `<button class="link-button check-action" type="button" data-action="toggle-check" data-key="terminology_not_needed" data-state="not_needed">Mark no terminology needed</button>` : ''}${item.key === 'terminology_ready' && item.complete && workspace.terms.length === 0 ? `<button class="link-button check-action" type="button" data-action="toggle-check" data-key="terminology_not_needed" data-state="pending">Undo mark</button>` : ''}</div></li>`).join('')}</ul>`;
}
function termsHtml(workspace, readonly) {
  if (!workspace.terms.length) return `<p class="section-subtitle">No terminology recorded yet.</p>`;
  return `<div class="list-stack">${workspace.terms.map(term => `<details class="item-card"><summary><strong>${esc(term.sourceTerm)}</strong> → ${esc(term.targetTerm)}${term.contextRegister ? `<span class="item-card__meta"> · ${esc(term.contextRegister)}</span>` : ''}</summary>${readonly ? '' : `<form data-form="term-edit" data-term-id="${attr(term.id)}" class="details-form"><div class="divider"></div>${field({label:'Source term',name:'sourceTerm',value:term.sourceTerm,required:true,maxLength:200})}${field({label:'Target term',name:'targetTerm',value:term.targetTerm,required:true,maxLength:200})}${field({label:'Context or register',name:'contextRegister',value:term.contextRegister,maxLength:500})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save term','button--small')}<button type="button" class="button button--danger button--small" data-action="delete-term" data-id="${attr(term.id)}">Delete</button></div></form>`}</details>`).join('')}</div>`;
}
function followupsHtml(workspace, readonly) {
  if (!workspace.followups.length) return `<p class="section-subtitle">No follow-ups recorded yet.</p>`;
  return `<div class="list-stack">${workspace.followups.map(item => `<article class="item-card"><div class="item-card__top"><div><p class="item-card__body" lang="und" dir="auto">${esc(item.text)}</p><p class="item-card__meta">${item.status === 'done' ? `Done${item.resolved_at ? ` · ${esc(formatDate(item.resolved_at, workspace.session.timezone))}` : ''}` : 'Open'}</p></div>${workspace.session.status !== 'cancelled' ? button(item.status === 'done' ? 'Reopen' : 'Mark done', 'toggle-followup', 'button button--secondary button--small', `data-id="${attr(item.id)}" data-status="${item.status === 'done' ? 'open' : 'done'}"`) : '<span class="status">Read only</span>'}</div>${!readonly && ['scheduled','in_progress'].includes(workspace.session.status) ? `<details><summary>Edit follow-up</summary><form data-form="followup-edit" data-followup-id="${attr(item.id)}" class="details-form">${field({label:'Follow-up text',name:'text',value:item.text,required:true,maxLength:1000})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save','button--small')}<button type="button" class="button button--danger button--small" data-action="delete-followup" data-id="${attr(item.id)}">Delete</button></div></form></details>` : ''}</article>`).join('')}</div>`;
}
function entriesHtml(workspace) {
  if (!workspace.entries.length) return `<div class="empty-state"><h3>No entries yet.</h3><p>Record source text, your interpreted text, or a note when you are ready. Nothing is generated for you.</p></div>`;
  const labels = { source: 'Source text', interpretation: 'Interpreted text', note: 'Note' };
  return `<div class="workspace-stream">${workspace.entries.map(entry => `<article class="item-card"><div class="item-card__top"><div><span class="entry-label entry-label--${attr(entry.kind)}">${labels[entry.kind]}</span><p class="item-card__meta">${esc(formatDate(entry.created_at, workspace.session.timezone))}${entry.edited_at ? ' · Edited' : ''}</p></div><details><summary class="link-button">Edit</summary><form data-form="entry-edit" data-entry-id="${attr(entry.id)}" class="details-form">${field({label:'Entry type',name:'kind',options:`${['source','interpretation','note'].map(k=>`<option value="${k}" ${k===entry.kind?'selected':''}>${labels[k]}</option>`).join('')}`})}${field({label:'Entry text',name:'body',type:'textarea',value:entry.body,required:true,maxLength:5000})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save changes','button--small')}<button type="button" class="button button--danger button--small" data-action="delete-entry" data-id="${attr(entry.id)}">Delete</button></div></form></details></div><p class="item-card__body" lang="und" dir="auto">${esc(entry.body)}</p></article>`).join('')}</div>`;
}
function renderWorkspace(workspace) {
  activeWorkspace = workspace;
  const s = workspace.session;
  if (s.status === 'completed') { go(`/sessions/${encodeURIComponent(s.id)}/summary`); return; }
  const readonly = s.status === 'cancelled';
  const actions = s.status === 'scheduled' ? `${button('Edit details','edit-session','button button--secondary',`data-id="${attr(s.id)}"`)}${button('Cancel session','cancel-session','button button--danger',`data-id="${attr(s.id)}"`)}<button class="button button--primary" data-action="start-session" data-id="${attr(s.id)}">Start session ${icon('arrow')}</button>` : s.status === 'in_progress' ? `${button('Edit details','edit-session','button button--secondary',`data-id="${attr(s.id)}"`)}<a class="button button--primary" href="#/sessions/${encodeURIComponent(s.id)}/finish">Finish session ${icon('arrow')}</a>` : `${button('Delete session','delete-session','button button--danger',`data-id="${attr(s.id)}"`)}`;
  const timer = s.status === 'in_progress' ? `<span class="timer"><span class="timer__label">Elapsed</span><span data-live-timer>${formatDuration(Math.floor((Date.parse(workspace.serverNow)-Date.parse(s.startedAt))/1000))}</span></span>` : '';
  const heading = `<p class="breadcrumb"><a href="#/app">Dashboard</a> / Session</p>${pageHeading('SESSION WORKSPACE',esc(s.title),sessionMeta(s),actions)}<div class="workspace-header-facts">${statusBadge(s.status)}${timer ? `<span>${timer}</span>` : ''}${s.status === 'scheduled' ? `<span>Timer starts when you start the session.</span>` : ''}</div>`;
  const tabs = `<div class="mobile-tabs" role="tablist" aria-label="Session workspace sections"><button type="button" class="button ${activeTab==='stream'?'button--primary':'button--secondary'}" role="tab" aria-selected="${activeTab==='stream'}" data-action="workspace-tab" data-tab="stream">Stream</button><button type="button" class="button ${activeTab==='terms'?'button--primary':'button--secondary'}" role="tab" aria-selected="${activeTab==='terms'}" data-action="workspace-tab" data-tab="terms">Terms (${workspace.terms.length})</button><button type="button" class="button ${activeTab==='followups'?'button--primary':'button--secondary'}" role="tab" aria-selected="${activeTab==='followups'}" data-action="workspace-tab" data-tab="followups">Follow-ups (${workspace.followups.filter(x=>x.status==='open').length})</button><button type="button" class="button ${activeTab==='context'?'button--primary':'button--secondary'}" role="tab" aria-selected="${activeTab==='context'}" data-action="workspace-tab" data-tab="context">Context</button><button type="button" class="button ${activeTab==='assistant'?'button--primary':'button--secondary'}" role="tab" aria-selected="${activeTab==='assistant'}" data-action="workspace-tab" data-tab="assistant">Assistant</button></div>`;
  const streamPanel = `<section class="panel workspace-main side-stream"><div class="panel__head"><div><h2>Conversation stream</h2><p>Manual entries only. Live transcription is not available in this version.</p></div></div>${entriesHtml(workspace)}${s.status === 'in_progress' ? `<div class="workspace-composer"><h3>Add an entry</h3><form data-form="entry-create">${field({label:'Entry type',name:'kind',options:'<option value="source">Source text</option><option value="interpretation">Interpreted text</option><option value="note">Note</option>'})}${field({label:'Text',name:'body',type:'textarea',required:true,maxLength:5000,attrs:'placeholder="Record only what you choose to save."'})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save entry')}</div><p class="save-state">Text is saved only after the server confirms.</p></form></div>` : `<p class="notice">This session is ${s.status === 'cancelled' ? 'cancelled and read-only' : esc(s.status)}. Editing the stream is not available.</p>`}</section>`;
  const termsPanel = `<section class="panel side-terms"><div class="panel__head"><div><h2>Terminology</h2><p>${workspace.terms.length} saved term${workspace.terms.length===1?'':'s'} for this session.</p></div></div>${termsHtml(workspace,readonly)}${!readonly ? `<div class="divider"></div><form data-form="term-create">${field({label:'Source term',name:'sourceTerm',required:true,maxLength:200})}${field({label:'Target term',name:'targetTerm',required:true,maxLength:200})}${field({label:'Context or register',name:'contextRegister',maxLength:500})}<p class="form-feedback" data-feedback></p><p class="form-note" id="term-duplicate-warning" hidden>A source term like this already exists in this session. You can still save another context-specific term.</p><div class="form-actions">${submitButton('Add term')}</div></form>` : ''}</section>`;
  const followPanel = `<section class="panel side-followups"><div class="panel__head"><div><h2>Follow-ups</h2><p>${workspace.followups.filter(x=>x.status==='open').length} open</p></div></div>${followupsHtml(workspace,readonly)}${!readonly && ['scheduled','in_progress'].includes(s.status) ? `<div class="divider"></div><form data-form="followup-create">${field({label:'Follow-up action',name:'text',type:'textarea',required:true,maxLength:1000,attrs:'placeholder="A question or action to resolve after the session"'})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Add follow-up')}</div></form>` : ''}</section>`;
  const prep = workspace.preparation;
  const prepPanel = `<section class="panel side-context"><div class="panel__head"><div><h2>Preparation and context</h2><p>${workspace.prepChecklist.filter(i=>i.complete).length} of 5 ready</p></div></div><p class="section-subtitle">Goal</p><p class="text-content" lang="und" dir="auto">${esc(prep.goal || 'No goal recorded.')}</p><p class="section-subtitle">Context</p><p class="text-content" lang="und" dir="auto">${esc(prep.context || 'No context recorded.')}</p><p class="section-subtitle">Instructions</p><p class="text-content" lang="und" dir="auto">${esc(prep.instructions || 'No instructions recorded.')}</p><p class="section-subtitle">Names and pronunciation</p><p class="text-content" lang="und" dir="auto">${esc(prep.namesPronunciation || 'None recorded.')}</p><p class="section-subtitle">Tone / register</p><p class="text-content" lang="und" dir="auto">${esc(prep.toneRegister || 'None recorded.')}</p><p class="section-subtitle">Open questions</p><p class="text-content" lang="und" dir="auto">${esc(prep.openQuestions || 'None recorded.')}</p><div class="divider"></div>${checklistHtml(workspace)}<div class="form-actions"><a class="button button--secondary button--block" href="#/sessions/${encodeURIComponent(s.id)}/prepare">Edit preparation</a></div></section>`;
  const content = `${heading}${s.status === 'cancelled' ? '<div class="notice notice--warning">Cancelled sessions are read-only. Delete is available if this record should be removed.</div>' : ''}${tabs}<div class="workspace-layout" data-active-tab="${attr(activeTab)}">${streamPanel}<aside class="workspace-side">${termsPanel}${followPanel}${prepPanel}</aside><section class="panel side-assistant">${assistantPanelHtml('workspace')}</section></div>`;
  renderWithToast(appShell(content)); startTimer(s, workspace.serverNow);
}
async function loadWorkspace(sessionId) {
  renderWithToast(appShell(`${pageHeading('SESSION WORKSPACE','Loading session…')}<div class="loading-state" role="status">Loading saved session information…</div>`));
  try {
    const startHash = location.hash;
    const workspace = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`, { signal: routeController?.signal });
    if (startHash !== location.hash) return;
    renderWorkspace(workspace);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401) { currentUser = null; go(`/signin?next=${encodeURIComponent(`/sessions/${sessionId}`)}`); return; }
    renderWithToast(appShell(`${pageHeading('SESSION WORKSPACE','Session unavailable','The record could not be opened.')} ${pageError(error.message)}`));
  }
}
function rehearsalLabHtml() {
  return `<section class="panel prep-lab"><div class="panel__head"><div><p class="eyebrow">LOCAL TEXT REVIEW</p><h2>Preparation Review</h2><p>Flag difficult source-text patterns before the assignment, then decide what deserves rehearsal.</p></div></div><label class="prep-lab__label" for="rehearsal-source">Permitted source-text excerpt</label><textarea id="rehearsal-source" maxlength="12000" rows="7" lang="und" dir="auto" placeholder="Paste a short excerpt you are allowed to use. Example: The committee expects costs to rise by 18% by 2030, although the revised model assumes a 2.4°C increase if investment is delayed."></textarea><p class="field-hint">Analyzed in this browser only. No audio is captured and no remote AI is called. Do not paste confidential or restricted material unless your client permits it.</p><div class="form-actions"><button type="button" class="button button--primary" data-action="analyze-rehearsal">Review excerpt</button><button type="button" class="button button--secondary" data-action="use-rehearsal-example">Load fictional example</button></div><div id="rehearsal-results" aria-live="polite"></div></section>`;
}
function assistantPanelHtml(location) {
  const messages = activeAssistantMessages.map(message => `<div class="assistant-chat-message ${message.role === 'user' ? 'assistant-chat-message--user' : ''}"><span class="assistant-chat-message__label">${message.role === 'user' ? 'YOU' : 'CADENCE ASSISTANT'}</span><p lang="und" dir="auto">${esc(message.text)}</p>${message.role === 'assistant' && message.insertable ? `<button type="button" class="link-button assistant-insert" data-action="assistant-insert" data-location="${attr(message.insertLocation || location)}">Add to ${message.insertLocation === 'followup' ? 'follow-ups' : 'preparation'}</button>` : ''}</div>`).join('');
  const prompts = ASSISTANT_PROMPTS.map(prompt => `<button type="button" data-action="assistant-prompt" data-prompt="${attr(prompt.key)}" data-location="${attr(location)}">${esc(prompt.label)}</button>`).join('');
  return `<section class="panel assistant-panel" aria-label="Cadence assistant"><div class="assistant-panel__head"><div class="assistant-panel__avatar" aria-hidden="true">C</div><div><h2>Cadence assistant</h2><p>A helper, not a second interpreter — answers come from your saved session data and the local text scan.</p></div></div><div class="assistant-panel__prompts">${prompts}</div><div class="assistant-chat-history" id="assistant-chat-history" aria-live="polite">${messages || '<p class="assistant-chat-empty">Ask a question or pick a prompt above. The assistant runs in your browser only — nothing is sent anywhere.</p>'}</div><form data-form="assistant" data-location="${attr(location)}"><label class="sr-only" for="assistant-input">Ask the Cadence assistant</label><textarea id="assistant-input" name="message" rows="2" maxlength="600" placeholder="Ask about a term, figure, or what to rehearse…" dir="auto"></textarea><div class="assistant-panel__form-footer"><span>Rules-based · no AI service connected</span><button class="button button--primary button--small" type="submit">Send</button></div></form><p class="assistant-disclaimer">Suggestions can be incomplete or wrong. Verify against approved sources and the speaker's meaning. Nothing is saved unless you choose to add it.</p></section>`;
}
function rehearsalResultsHtml(result) {
  if (!result || result.empty) return '<p class="form-feedback" role="alert">Paste an excerpt before reviewing it.</p>';
  const list = (items, emptyText, render) => items.length ? `<ul class="rehearsal-list">${items.map(render).join('')}</ul>` : `<p class="rehearsal-empty">${emptyText}</p>`;
  const sentenceHtml = list(result.longSentences, 'No long/complex-sentence heuristic flags in this excerpt. That does not mean the text is easy.', item => `<li><span class="rehearsal-tag">Sentence ${item.index} · ${item.wordCount} words</span><p lang="und" dir="auto">${esc(item.sentence)}</p><small>Flagged because of ${esc(item.reasons.join(', '))}. A flag is a practice cue, not a judgement.</small><details class="sentence-drill"><summary>Practice this sentence</summary><div class="sentence-drill__content"><ol><li>State the core claim without losing the main idea.</li><li>Identify the condition, contrast, cause or qualification that changes the claim.</li><li>Check what the figures, pronouns and modifiers refer to.</li></ol><label for="drill-note-${item.index}">My brief rehearsal cue</label><textarea id="drill-note-${item.index}" data-rehearsal-answer data-sentence-index="${item.index}" maxlength="220" rows="2" placeholder="My own short cue: core claim + condition / contrast to preserve…"></textarea><p class="field-hint">Write your own cue; don't paste the source sentence. This is saved only if you choose Add review cues, then Save preparation.</p></div></details></li>`);
  const figureHtml = list(result.figureContexts, 'No number or unit patterns were found.', item => `<li><code>${esc(item.value)}</code><p class="rehearsal-context">Sentence ${item.sentenceIndex}: ${esc(item.sentence.slice(0, 190))}${item.sentence.length > 190 ? '…' : ''}</p><span>Practice: say the value together with its unit, timeframe and comparison baseline.</span></li>`);
  const acronymHtml = list(result.acronymContexts, 'No all-capital acronyms were found.', item => `<li><code>${esc(item.value)}</code><p class="rehearsal-context">Sentence ${item.sentenceIndex}: ${esc(item.sentence.slice(0, 190))}${item.sentence.length > 190 ? '…' : ''}</p><span>Check the full form and the appropriate target-language convention.</span></li>`);
  const nameHtml = list(result.nameContexts, 'No multiword capitalized phrase candidates were found.', item => `<li><code>${esc(item.value)}</code><p class="rehearsal-context">Sentence ${item.sentenceIndex}: ${esc(item.sentence.slice(0, 190))}${item.sentence.length > 190 ? '…' : ''}</p><span>Candidate only; verify whether this is a proper name or a false positive.</span></li>`);
  const report = formatRehearsalNotes(result);
  activeRehearsalNotes = report;
  const totalFlags = result.longSentences.length + result.figures.length + result.acronyms.length + result.nameCandidates.length;
  return `<div class="rehearsal-result-head"><div><strong>Review flags</strong><p>${result.wordCount} words checked${result.truncated ? ` · source was limited to the first ${result.characters} characters` : ''}. These are heuristic cues, not judgments of meaning or translation quality.</p></div><span class="rehearsal-count">${totalFlags} flags</span></div><div class="rehearsal-grid"><section><h3>Long / complex sentences <span>${result.longSentences.length}</span></h3>${sentenceHtml}</section><section><h3>Figures / measurements <span>${result.figures.length}</span></h3>${figureHtml}</section><section><h3>Acronyms <span>${result.acronyms.length}</span></h3>${acronymHtml}</section><section><h3>Possible names / terms <span>${result.nameCandidates.length}</span></h3>${nameHtml}</section></div><details class="rehearsal-anticipation"><summary>Practice anticipating from context <span>Optional</span></summary><div class="rehearsal-anticipation__content"><p>Use the assignment brief and material to form your own hypothesis. Cadence does not predict what a speaker will say.</p><label for="rehearsal-expected">What point might reasonably come next?</label><textarea id="rehearsal-expected" data-rehearsal-anticipation="expected" maxlength="220" rows="2" placeholder="My hypothesis, not a fact…"></textarea><label for="rehearsal-evidence">What supports it—and what alternative should I keep open?</label><textarea id="rehearsal-evidence" data-rehearsal-anticipation="evidence" maxlength="220" rows="2" placeholder="Context clue + possible alternative…"></textarea></div></details><div class="rehearsal-prompts"><strong>Use these practice prompts</strong><ol><li>State the main claim in your own words, then preserve conditions and contrasts.</li><li>Recall each number with its unit, timeframe and comparison baseline.</li><li>Expand acronyms and check candidate names against a reliable source.</li></ol></div><p class="field-hint">The scan does not verify facts, predict speaker intent, segment meaning reliably or produce an interpretation. Review flags manually.</p><button type="button" class="button button--secondary" data-action="insert-rehearsal-notes">Add my review cues to preparation</button><p class="save-state">Review the notes in “Open questions and unresolved terminology”, then select Save preparation to store them.</p>`;
}
function preparationView(workspace) {
  const s = workspace.session; const p = workspace.preparation; const readOnly = ['completed','cancelled'].includes(s.status);
  if (readOnly) return appShell(`${pageHeading('PREPARATION','Preparation is read-only','Completed and cancelled records cannot be changed.')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Back to session</a>`);
  return appShell(`<p class="breadcrumb"><a href="#/app">Dashboard</a> / <a href="#/sessions/${encodeURIComponent(s.id)}">${esc(s.title)}</a> / Preparation</p>${pageHeading('PREPARATION PRIMER','Get ready for the session','Save the parts you know; leave the rest blank until you can confirm them.') }<section class="panel"><div class="panel__head"><div><h2>${esc(s.title)}</h2><p>${esc(languageName(s.languageFrom))} → ${esc(languageName(s.languageTo))} · ${esc(formatDate(s.scheduledStartUtc,s.timezone))}</p></div>${statusBadge(s.status)}</div><form data-form="preparation" data-session-id="${attr(s.id)}">${field({label:'Session goal',name:'goal',type:'textarea',value:p.goal,maxLength:2000,attrs:'placeholder="What is this assignment intended to accomplish?"'})}${field({label:'Client / assignment context',name:'context',type:'textarea',value:p.context,maxLength:4000,attrs:'placeholder="Relevant background that belongs to this session."'})}${field({label:'Interpretation instructions',name:'instructions',type:'textarea',value:p.instructions,maxLength:4000,attrs:'placeholder="Instructions you have received and want close at hand."'})}<details ${p.namesPronunciation || p.toneRegister || p.openQuestions ? 'open' : ''}><summary>Optional details</summary><div class="details-form">${field({label:'Names and pronunciation',name:'namesPronunciation',type:'textarea',value:p.namesPronunciation,maxLength:2000})}${field({label:'Tone / register',name:'toneRegister',value:p.toneRegister,maxLength:500})}${field({label:'Open questions and unresolved terminology',name:'openQuestions',type:'textarea',value:p.openQuestions,maxLength:3000})}</div></details><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save preparation')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Back to session</a><span class="save-state" data-save-state>${p.updatedAt ? `Last saved ${esc(formatDate(p.updatedAt,s.timezone))}` : 'Not saved yet.'}</span></div></form></section>${rehearsalLabHtml()}${assistantPanelHtml('preparation')}<section class="panel"><div class="panel__head"><div><h2>Preparation checklist</h2><p>Data-derived items update from saved information. Review marks require an explicit action.</p></div></div>${checklistHtml(workspace)}</section>`);
}
async function loadPreparation(sessionId) {
  try {
    const workspace = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`, { signal: routeController?.signal });
    if (location.hash.includes(`/sessions/${sessionId}/prepare`)) renderWithToast(preparationView(workspace));
  } catch (error) {
    if (error.name === 'AbortError') return;
    renderWithToast(appShell(`${pageHeading('PREPARATION','Could not open preparation')} ${pageError(error.message)}`));
  }
}
function finishView(workspace) {
  const s = workspace.session;
  if (s.status !== 'in_progress') return appShell(`${pageHeading('CLOSEOUT','This session cannot be finished from here','Only an in-progress session can be completed.')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Back to session</a>`);
  const preview = Math.max(0, Math.floor((Date.parse(workspace.serverNow)-Date.parse(s.startedAt))/1000));
  return appShell(`<p class="breadcrumb"><a href="#/app">Dashboard</a> / <a href="#/sessions/${encodeURIComponent(s.id)}">${esc(s.title)}</a> / Finish</p>${pageHeading('CLOSEOUT','Review before finishing','Finishing saves the end time and duration on the server. The completed core record then becomes read-only.') }<section class="panel"><div class="panel__head"><div><h2>${esc(s.title)}</h2><p>${esc(languageName(s.languageFrom))} → ${esc(languageName(s.languageTo))} · ${esc(s.clientLabel || 'Client not recorded')}</p></div>${statusBadge(s.status)}</div><div class="finish-preview"><div class="finish-stat"><strong>${formatDuration(preview)}</strong><span>Duration preview, not yet saved</span></div><div class="finish-stat"><strong>${workspace.entries.length}</strong><span>Saved entries</span></div><div class="finish-stat"><strong>${workspace.terms.length}</strong><span>Terminology items</span></div></div><h2 class="section-title">Saved record review</h2><p>${workspace.entries.filter(x=>x.kind==='note').length} note(s), ${workspace.followups.filter(x=>x.status==='open').length} open follow-up(s). You can return to the workspace to make changes before finishing.</p><div class="divider"></div><form data-form="session-finish" data-session-id="${attr(s.id)}">${field({label:'Optional session summary',name:'summary',type:'textarea',maxLength:4000,attrs:'placeholder="Write your own summary. Cadence does not generate one."'})}<p class="form-note">Optional, up to 4,000 characters. The saved duration is calculated by the server; no duration is sent from this form.</p><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Confirm and finish')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Back to workspace</a></div></form></section><section class="panel"><h2 class="section-title">Outstanding follow-ups</h2>${followupsHtml(workspace,false)}</section>`);
}
async function loadFinish(sessionId) {
  try {
    const workspace = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`, { signal: routeController?.signal });
    if (location.hash.includes(`/sessions/${sessionId}/finish`)) renderWithToast(finishView(workspace));
  } catch (error) {
    if (error.name === 'AbortError') return;
    renderWithToast(appShell(`${pageHeading('CLOSEOUT','Could not load the saved session')} ${pageError(error.message)}`));
  }
}
function summaryView(workspace) {
  const s = workspace.session;
  if (s.status !== 'completed') return appShell(`${pageHeading('SESSION SUMMARY','This session is not complete','Finish an in-progress session to open its saved summary.')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Return to session</a>`);
  const groupEntries = kind => workspace.entries.filter(e=>e.kind===kind);
  const grouped = (kind, label) => `<section class="panel"><h2 class="section-title">${label}</h2>${groupEntries(kind).length ? `<div class="list-stack">${groupEntries(kind).map(e=>`<article class="item-card"><p class="item-card__meta">${esc(formatDate(e.created_at,s.timezone))}${e.edited_at?' · Edited':''}</p><p class="text-content" lang="und" dir="auto">${esc(e.body)}</p></article>`).join('')}</div>` : `<p class="section-subtitle">No ${label.toLowerCase()} were recorded.</p>`}</section>`;
  const termList = workspace.terms.length ? `<ul>${workspace.terms.map(t=>`<li><strong>${esc(t.sourceTerm)}</strong> → ${esc(t.targetTerm)}${t.contextRegister?` <span class="item-card__meta">(${esc(t.contextRegister)})</span>`:''}</li>`).join('')}</ul>` : '<p class="section-subtitle">No terminology was recorded.</p>';
  const followList = workspace.followups.length ? `<ul>${workspace.followups.map(f=>`<li>${f.status==='done'?'Completed':'Open'}: ${esc(f.text)}${f.status==='done'&&f.resolved_at?` <span class="item-card__meta">· ${esc(formatDate(f.resolved_at,s.timezone))}</span>`:''}${button(f.status==='done'?'Reopen':'Mark done','toggle-followup','button button--secondary button--small',`data-id="${attr(f.id)}" data-status="${f.status==='done'?'open':'done'}"`)}</li>`).join('')}</ul>` : '<p class="section-subtitle">No follow-ups were recorded.</p>';
  const actions = `${button('Export JSON','export-json','button button--secondary',`data-id="${attr(s.id)}"`)}${button('Export Markdown','export-markdown','button button--secondary',`data-id="${attr(s.id)}"`)}<a class="button button--primary" href="#/app">Back to dashboard</a>`;
  return appShell(`<p class="breadcrumb"><a href="#/app">Dashboard</a> / Session summary</p>${pageHeading('COMPLETED RECORD',esc(s.title),`${esc(languageName(s.languageFrom))} → ${esc(languageName(s.languageTo))} · ${esc(s.clientLabel || 'Client not recorded')}`, actions)}<div class="summary-facts"><div class="summary-fact"><div class="summary-fact__label">Status</div><div class="summary-fact__value">${statusBadge(s.status)}</div></div><div class="summary-fact"><div class="summary-fact__label">Scheduled</div><div class="summary-fact__value">${esc(formatDate(s.scheduledStartUtc,s.timezone))}</div></div><div class="summary-fact"><div class="summary-fact__label">Started</div><div class="summary-fact__value">${esc(formatDate(s.startedAt,s.timezone))}</div></div><div class="summary-fact"><div class="summary-fact__label">Ended</div><div class="summary-fact__value">${esc(formatDate(s.endedAt,s.timezone))}</div></div><div class="summary-fact"><div class="summary-fact__label">Duration</div><div class="summary-fact__value">${formatDuration(s.durationSeconds)}</div></div><div class="summary-fact"><div class="summary-fact__label">Saved items</div><div class="summary-fact__value">${workspace.entries.length} entries · ${workspace.terms.length} terms</div></div></div><section class="panel"><h2 class="section-title">Preparation</h2><div class="grid-2"><div><p class="section-subtitle">Goal</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.goal || 'No goal was recorded.')}</p></div><div><p class="section-subtitle">Context</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.context || 'No context was recorded.')}</p></div><div><p class="section-subtitle">Instructions</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.instructions || 'No instructions were recorded.')}</p></div><div><p class="section-subtitle">Names and pronunciation</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.namesPronunciation || 'None recorded.')}</p></div><div><p class="section-subtitle">Tone / register</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.toneRegister || 'None recorded.')}</p></div><div><p class="section-subtitle">Open questions</p><p class="text-content" lang="und" dir="auto">${esc(workspace.preparation.openQuestions || 'None recorded.')}</p></div></div></section>${grouped('source','Source text')}${grouped('interpretation','Interpreted text')}${grouped('note','Notes')}<section class="panel"><h2 class="section-title">Terminology</h2>${termList}</section><section class="panel"><h2 class="section-title">Follow-ups</h2>${followList}</section><section class="panel"><h2 class="section-title">Session summary</h2><p class="text-content" lang="und" dir="auto">${esc(s.completionSummary || 'No summary was recorded.')}</p><div class="divider"></div><form data-form="summary-addendum" data-session-id="${attr(s.id)}">${field({label:'Edit summary addendum',name:'summaryAddendum',type:'textarea',value:s.completionSummary,maxLength:4000,hint:'The completed session record is read-only except for this summary and follow-up status.'})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save summary')}</div></form><p class="save-state">This view is assembled from the saved server record. Reopening it does not rewrite the session.</p></section>`);
}
async function loadSummary(sessionId) {
  try {
    const workspace = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`, { signal: routeController?.signal });
    if (location.hash.includes(`/sessions/${sessionId}/summary`)) renderWithToast(summaryView(workspace));
  } catch (error) {
    if (error.name === 'AbortError') return;
    renderWithToast(appShell(`${pageHeading('SESSION SUMMARY','Could not load the saved record')} ${pageError(error.message)}`));
  }
}
async function editSessionView(sessionId) {
  try {
    const data = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
    const s = data.session; const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: s.timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(s.scheduledStartUtc)).replace(' ', 'T');
    renderWithToast(appShell(`<p class="breadcrumb"><a href="#/app">Dashboard</a> / <a href="#/sessions/${encodeURIComponent(s.id)}">${esc(s.title)}</a> / Edit details</p>${pageHeading('SESSION DETAILS','Edit session information','Updates are saved using a version check so another tab cannot silently overwrite newer details.')}<section class="panel panel--medium"><form data-form="session-edit" data-session-id="${attr(s.id)}" data-version="${attr(s.version)}"><div class="grid-2">${field({label:'Session title',name:'title',value:s.title,required:true,maxLength:200})}${field({label:'Client or assignment label',name:'clientLabel',value:s.clientLabel,maxLength:160})}${field({label:'Source language',name:'languageFrom',options:languageOptions(s.languageFrom),required:true})}${field({label:'Target language',name:'languageTo',options:languageOptions(s.languageTo),required:true})}${field({label:'Scheduled local date and time',name:'scheduledStartLocal',type:'datetime-local',value:localDate,required:true})}${field({label:'Time zone',name:'timezone',value:s.timezone,required:true,maxLength:80})}</div><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save changes')}<a class="button button--secondary" href="#/sessions/${encodeURIComponent(s.id)}">Cancel</a></div></form></section>`));
  } catch (error) {
    renderWithToast(appShell(`${pageHeading('SESSION DETAILS','Could not open session details')} ${pageError(error.message)}`));
  }
}
function settingsView(user) {
  return appShell(`${pageHeading('ACCOUNT SETTINGS','Your account','A minimal set of preferences for this local workspace.') }<div class="settings-grid"><section class="panel"><h2 class="section-title">Preferences</h2><p class="section-subtitle">Local development mode — accounts are stored in a database file on this computer. This is not production authentication.</p><form data-form="settings">${field({label:'Display name',name:'displayName',value:user.displayName,required:true,maxLength:80})}${field({label:'Default time zone',name:'defaultTimezone',value:user.defaultTimezone,required:true,maxLength:80,hint:'Use an IANA zone such as Asia/Dhaka.'})}<div class="grid-2">${field({label:'Default source language',name:'defaultLanguageFrom',options:`<option value="">Choose later</option>${languageOptions(user.defaultLanguageFrom)}`})}${field({label:'Default target language',name:'defaultLanguageTo',options:`<option value="">Choose later</option>${languageOptions(user.defaultLanguageTo)}`})}</div><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Save preferences')}</div></form></section><div><section class="panel"><h2 class="section-title">Change password</h2><p class="section-subtitle">Changing your password signs out every active session.</p><form data-form="password-change">${field({label:'Current password',name:'currentPassword',type:'password',required:true,autocomplete:'current-password',maxLength:128})}${field({label:'New password',name:'newPassword',type:'password',required:true,autocomplete:'new-password',maxLength:128,hint:'10–128 characters; common passwords are blocked.'})}<p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Change password','button--secondary')}</div></form></section><section class="panel danger-zone panel--spaced"><h2 class="section-title">Delete account</h2><p>Hard-deletes this local account, its sessions, notes, terms, preparation and follow-ups. Export any records you need first. This cannot be undone.</p><form data-form="account-delete">${field({label:'Current password',name:'currentPassword',type:'password',required:true,autocomplete:'current-password',maxLength:128})}<label class="checkbox-row"><input type="checkbox" name="confirm" required><span>I understand this deletes my local account and its records.</span></label><p class="form-feedback" data-feedback></p><div class="form-actions">${submitButton('Delete account','button--danger')}</div></form></section></div></div>`);
}

async function submitHandler(event) {
  const form = event.target.closest('form[data-form]'); if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'demo-assistant') {
    const input = form.elements.message;
    const message = String(input?.value || '').trim();
    if (!message) return;
    demoAssistantMessages.push({ role: 'user', text: message });
    const normalized = message.toLocaleLowerCase();
    let reply = 'I can help identify what to verify, but this preview does not run a language model. Check the original wording, context and an approved terminology source before using a translation.';
    if (/number|date|dosage|dose|tablet|twice|november|18/.test(normalized)) reply = 'Review cue: preserve “one tablet twice daily” as stated and verify the date “November 18” in the local date convention. This is a sample rule-based response, not a clinical verification.';
    else if (/term|word|terminology|glossary/.test(normalized)) reply = 'Terminology cue: compare the source term, target equivalent, register and domain. Add a source or context note to the session glossary, and verify the preferred wording with an approved reference.';
    else if (/phrase|sentence|meaning|explain/.test(normalized)) reply = 'Break the sentence into its main action, condition and timing. Keep the original meaning intact, and ask for clarification rather than guessing when context is insufficient. Sample response only.';
    demoAssistantMessages.push({ role: 'assistant', text: reply });
    renderWithToast(liveWorkspaceDemoView());
    document.querySelector('#demo-chat-history')?.scrollTo({ top: 99999, behavior: 'auto' });
    document.querySelector('#demo-assistant-input')?.focus();
    return;
  }
  if (kind === 'demo-term') {
    const data = Object.fromEntries(new FormData(form).entries());
    const source = String(data.source || '').trim(); const target = String(data.target || '').trim();
    if (!source || !target) return;
    demoTerms.push({ source, target, note: String(data.note || '').trim() || 'Added in preview · verify before use' });
    renderWithToast(liveWorkspaceDemoView());
    toast('Term added to this preview session. It is not saved to your account.');
    return;
  }
  if (kind === 'assistant') {
    const message = String(form.elements.message?.value || '').trim();
    if (!message) return;
    runAssistant(message, form.dataset.location || 'preparation');
    return;
  }
  clearFormErrors(form);
  const data = Object.fromEntries(new FormData(form).entries());
  if (!validateBeforeSubmit(form, data)) return;
  const submit = form.querySelector('[type="submit"]'); const priorText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
  const feedback = form.querySelector('[data-feedback]');
  const putFeedback = (message, kind = 'error') => { if (feedback) { feedback.textContent = message; feedback.className = `form-feedback ${kind === 'success' ? 'form-success' : 'form-error'}`; feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status'); } };
  try {
    const kind = form.dataset.form;
    if (kind === 'signin') {
      const result = await api.post('/api/v1/auth/signin', { email: data.email, password: data.password, remember: true });
      currentUser = result.user; clearToast();
      const next = routeParts().query.get('next');
      go(currentUser.onboardingCompletedAt ? (next && next.startsWith('/') && !next.startsWith('//') ? next : '/app') : '/onboarding'); return;
    }
    if (kind === 'signup') {
      const result = await api.postIdempotent('/api/v1/auth/signup', { displayName: data.displayName, email: data.email, password: data.password }, form.dataset.idempotencyKey ||= crypto.randomUUID());
      currentUser = result.user; clearToast(); go('/onboarding'); return;
    }
    if (kind === 'forgot') {
      const result = await api.post('/api/v1/auth/recovery/request', { email: data.email });
      putFeedback(result.message, 'success'); form.reset(); return;
    }
    if (kind === 'reset') {
      if (!data.token) throw new Error('This link does not contain a reset token. Request a new one.');
      if (data.password !== data.confirmPassword) { form.querySelector('[name="confirmPassword"]').setAttribute('aria-invalid','true'); throw new Error('The passwords do not match.'); }
      const result = await api.post('/api/v1/auth/recovery/confirm', { token: data.token, password: data.password });
      putFeedback(result.message, 'success'); form.reset(); return;
    }
    if (kind === 'onboarding') {
      const result = await api.post('/api/v1/onboarding', { displayName: data.displayName, defaultTimezone: data.defaultTimezone, defaultLanguageFrom: data.defaultLanguageFrom, defaultLanguageTo: data.defaultLanguageTo, complete: true });
      currentUser = result.user; toast('Your preferences were saved on the server.'); go('/app'); return;
    }
    if (kind === 'session-create') {
      const result = await api.postIdempotent('/api/v1/sessions', { title: data.title, clientLabel: data.clientLabel, languageFrom: data.languageFrom, languageTo: data.languageTo, scheduledStartLocal: data.scheduledStartLocal, timezone: data.timezone }, form.dataset.idempotencyKey ||= crypto.randomUUID());
      toast('Session created and saved.'); go(`/sessions/${encodeURIComponent(result.session.id)}`); return;
    }
    if (kind === 'preparation') {
      const sessionId = form.dataset.sessionId;
      const result = await api.patch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/prep`, { goal: data.goal, context: data.context, instructions: data.instructions, namesPronunciation: data.namesPronunciation, toneRegister: data.toneRegister, openQuestions: data.openQuestions });
      const state = form.querySelector('[data-save-state]'); if (state) { state.textContent = `Saved ${formatDate(result.preparation.updatedAt, activeWorkspace?.session.timezone)}`; state.className = 'save-state save-state--saved'; }
      toast('Preparation saved.'); if (routeParts().path.endsWith('/prepare')) await loadPreparation(sessionId); else await refreshWorkspace(sessionId); return;
    }
    if (kind === 'entry-create') {
      const id = activeWorkspace?.session.id; if (!id) throw new Error('Open a session before adding an entry.');
      await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/entries`, { kind: data.kind, body: data.body });
      toast('Entry saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'entry-edit') {
      const id = activeWorkspace?.session.id; await api.patch(`/api/v1/sessions/${encodeURIComponent(id)}/entries/${encodeURIComponent(form.dataset.entryId)}`, { kind: data.kind, body: data.body });
      toast('Entry changes saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'term-create') {
      const id = activeWorkspace?.session.id;
      const source = data.sourceTerm.trim();
      const duplicate = !!activeWorkspace?.terms.some(t => t.sourceTerm.toLocaleLowerCase() === source.toLocaleLowerCase());
      await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/terms`, { sourceTerm: data.sourceTerm, targetTerm: data.targetTerm, contextRegister: data.contextRegister });
      toast(duplicate ? 'A similar source term exists; the new term was still saved.' : 'Term saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'term-edit') {
      const id = activeWorkspace?.session.id; await api.patch(`/api/v1/sessions/${encodeURIComponent(id)}/terms/${encodeURIComponent(form.dataset.termId)}`, { sourceTerm: data.sourceTerm, targetTerm: data.targetTerm, contextRegister: data.contextRegister });
      toast('Term changes saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'followup-create') {
      const id = activeWorkspace?.session.id; await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/followups`, { text: data.text }); toast('Follow-up saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'followup-edit') {
      const id = activeWorkspace?.session.id; await api.patch(`/api/v1/sessions/${encodeURIComponent(id)}/followups/${encodeURIComponent(form.dataset.followupId)}`, { text: data.text }); toast('Follow-up changes saved.'); await refreshWorkspace(id); return;
    }
    if (kind === 'session-finish') {
      const id = form.dataset.sessionId;
      if (!window.confirm('Finish this session? The saved core record will become read-only.')) return;
      const result = await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/complete`, { summary: data.summary });
      toast(`Session finished. Duration saved: ${formatDuration(result.session.durationSeconds)}.`); go(`/sessions/${encodeURIComponent(id)}/summary`); return;
    }
    if (kind === 'summary-addendum') {
      const id = form.dataset.sessionId; await api.patch(`/api/v1/sessions/${encodeURIComponent(id)}/summary`, { summaryAddendum: data.summaryAddendum });
      toast('Summary saved.'); await loadSummary(id); return;
    }
    if (kind === 'settings') {
      const result = await api.patch('/api/v1/settings', { displayName: data.displayName, defaultTimezone: data.defaultTimezone, defaultLanguageFrom: data.defaultLanguageFrom, defaultLanguageTo: data.defaultLanguageTo });
      currentUser = result.user; toast('Account preferences saved.'); await loadSettings(); return;
    }
    if (kind === 'password-change') {
      const result = await api.post('/api/v1/auth/password/change', { currentPassword: data.currentPassword, newPassword: data.newPassword });
      currentUser = null; toast(result.message, 'success'); go('/signin'); return;
    }
    if (kind === 'account-delete') {
      if (!form.elements.confirm.checked) throw new Error('Confirm account deletion first.');
      if (!window.confirm('Permanently delete this account and every saved record in the local database?')) return;
      const result = await api.delete('/api/v1/account', { currentPassword: data.currentPassword, confirm: true });
      currentUser = null; activeWorkspace = null; renderWithToast(`${publicNav()}<main id="main-content" class="auth-layout"><section class="auth-copy"><h1>Account deleted.</h1><p>${esc(result.message)}</p><a class="button button--primary" href="#/signup">Create another local account</a></section></main>${publicFooter()}`); return;
    }
    if (kind === 'session-edit') {
      const sessionId = form.dataset.sessionId;
      const result = await api.patch(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, { title: data.title, clientLabel: data.clientLabel, languageFrom: data.languageFrom, languageTo: data.languageTo, scheduledStartLocal: data.scheduledStartLocal, timezone: data.timezone, version: Number(form.dataset.version) });
      toast('Session details saved.'); go(`/sessions/${encodeURIComponent(result.session.id)}`); return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error instanceof ApiError) {
      if (Object.keys(error.fieldErrors || {}).length) applyFieldErrors(form, error.fieldErrors);
      putFeedback(error.message);
      if (error.status === 401 && !['signin','signup','forgot','reset'].includes(form.dataset.form)) { currentUser = null; go(`/signin?next=${encodeURIComponent(location.hash.slice(1))}`); }
      if (error.code === 'CONFLICT' && error.fieldErrors.currentSession) { putFeedback('This session changed in another tab. Reload the current record before saving again.'); const reload = document.createElement('button'); reload.type = 'button'; reload.className = 'button button--secondary button--small'; reload.textContent = 'Reload latest record'; reload.dataset.action = 'reload-session-edit'; reload.dataset.id = form.dataset.sessionId; feedback?.append(document.createTextNode(' '), reload); toast('Session conflict — reload to review the latest saved details.', 'error'); }
    } else putFeedback(error.message || 'The request failed. Your unsaved text is still in the form.');
  } finally {
    if (submit && submit.isConnected) { submit.disabled = false; submit.textContent = priorText || 'Submit'; }
  }
}

function validateBeforeSubmit(form, data) {
  const errors = {};
  for (const control of form.querySelectorAll('input,select,textarea')) {
    if (!control.name || control.type === 'hidden') continue;
    if (control.required && control.type === 'checkbox' && !control.checked) errors[control.name] = 'Please confirm this field.';
    else if (control.willValidate && !control.checkValidity()) errors[control.name] = control.validationMessage || 'Check this field.';
  }
  const kind = form.dataset.form;
  if (['signup','reset','password-change'].includes(kind)) {
    const password = data.password ?? data.newPassword;
    if (password !== undefined && (password.length < 10 || password.length > 128)) errors[data.password !== undefined ? 'password' : 'newPassword'] = 'Use a password between 10 and 128 characters.';
  }
  if (kind === 'signup' && data.password && ['password123','1234567890','qwerty12345','letmein1234','admin123456','welcome1234'].includes(data.password.toLowerCase())) errors.password = 'Choose a less common password.';
  if (['session-create','session-edit','settings','onboarding'].includes(kind) && data.languageFrom && data.languageTo && data.languageFrom.toLowerCase() === data.languageTo.toLowerCase()) errors.languageTo = 'Source and target languages must differ.';
  if (kind === 'reset' && data.password !== data.confirmPassword) errors.confirmPassword = 'The passwords do not match.';
  if (Object.keys(errors).length) { applyFieldErrors(form, errors); return false; }
  return true;
}
function blurHandler(event) {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return;
  const form = control.closest('form[data-form]');
  if (!form || !control.name || control.type === 'hidden') return;
  const errorNode = form.querySelector(`[data-error-for="${CSS.escape(control.name)}"]`);
  let message = '';
  if (control.required && control.type === 'checkbox' && !control.checked) message = 'Please confirm this field.';
  else if (control.willValidate && !control.checkValidity()) message = control.validationMessage || 'Check this field.';
  else if (control.name === 'password' && ['signup','reset'].includes(form.dataset.form) && control.value && (control.value.length < 10 || control.value.length > 128)) message = 'Use a password between 10 and 128 characters.';
  if (message) { control.setAttribute('aria-invalid','true'); if (errorNode) errorNode.textContent = message; }
  else { control.removeAttribute('aria-invalid'); if (errorNode) errorNode.textContent = ''; }
}

function clearFormErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  const feedback = form.querySelector('[data-feedback]'); if (feedback) { feedback.textContent = ''; feedback.className = 'form-feedback'; feedback.removeAttribute('role'); }
}
function applyFieldErrors(form, fieldErrors) {
  for (const [name, message] of Object.entries(fieldErrors || {})) {
    const input = form.elements.namedItem(name);
    if (input && typeof input.setAttribute === 'function') input.setAttribute('aria-invalid','true');
    const holder = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (holder) holder.textContent = message;
  }
  const invalid = form.querySelector('[aria-invalid="true"]'); invalid?.focus();
}
async function refreshWorkspace(sessionId) {
  const scroll = window.scrollY;
  try {
    const workspace = await api.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workspace`, { signal: routeController?.signal });
    if (!location.hash.includes(`/sessions/${sessionId}`)) return;
    renderWorkspace(workspace); window.scrollTo({ top: scroll, behavior: 'instant' });
  } catch (error) { if (error.name !== 'AbortError') toast(error.message, 'error'); }
}
async function loadSettings() {
  const data = await api.get('/api/v1/settings', { signal: routeController?.signal });
  currentUser = data.user; renderWithToast(settingsView(currentUser));
}
async function clickHandler(event) {
  const element = event.target.closest('[data-action]'); if (!element) return;
  const action = element.dataset.action; const id = element.dataset.id;
  try {
    if (action === 'demo-toggle-capture') {
      if (demoEnded) return;
      demoCapturing = !demoCapturing; demoPaused = false;
      renderWithToast(liveWorkspaceDemoView());
      toast(demoCapturing ? 'Preview state changed. No microphone is being accessed.' : 'Preview capture state stopped.'); return;
    }
    if (action === 'demo-pause') {
      if (demoEnded) return;
      demoPaused = !demoPaused;
      renderWithToast(liveWorkspaceDemoView());
      toast(demoPaused ? 'Session preview paused.' : 'Session preview resumed.'); return;
    }
    if (action === 'demo-end') {
      if (demoEnded) return;
      if (!window.confirm('End this sample preview session? No real session data will be saved.')) return;
      demoEnded = true; demoCapturing = false; demoPaused = false;
      renderWithToast(liveWorkspaceDemoView()); toast('Sample preview ended. No session record was changed.'); return;
    }
    if (action === 'demo-swap') {
      const source = document.querySelector('#demo-source-language'); const target = document.querySelector('#demo-target-language');
      if (!source || !target) return;
      const previous = source.value; source.value = target.value; target.value = previous;
      const from = source.value; const to = target.value;
      renderWithToast(liveWorkspaceDemoView());
      toast(`Language direction changed to ${languageName(from)} → ${languageName(to)}. Sample text is unchanged.`); return;
    }
    if (action === 'demo-assist') {
      const prompt = element.dataset.prompt;
      const prompts = { numbers: 'Please check the numbers and date in the sample transcript.', phrase: 'Explain the phrase “follow-up appointment” and what context to verify.', terms: 'How should I verify terminology for this session?' };
      const answers = {
        numbers: 'Review cue: the source includes “one tablet twice daily” and “November 18.” Confirm the dose wording and date convention against the source; do not infer extra instructions. Sample response only.',
        phrase: '“Follow-up appointment” generally refers to a later visit to review progress or continue care. The exact target wording may vary by setting; verify the preferred term in an approved glossary. Sample response only.',
        terms: 'Compare the source term, target equivalent, register and domain. Record a trusted source or context note for each term, and flag unresolved options rather than choosing by guesswork. Sample response only.'
      };
      demoAssistantMessages.push({ role: 'user', text: prompts[prompt] || 'Help me review this session.' }, { role: 'assistant', text: answers[prompt] || 'Use the source wording and context to decide what needs verification. Sample response only.' });
      renderWithToast(liveWorkspaceDemoView()); document.querySelector('#demo-chat-history')?.scrollTo({ top: 99999, behavior: 'auto' }); return;
    }
    if (action === 'demo-add-term') {
      const form = document.querySelector('.demo-add-term-form'); if (form) { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('[name="source"]')?.focus(); } return;
    }
    if (action === 'demo-cancel-term') { const form = document.querySelector('.demo-add-term-form'); if (form) { form.reset(); form.hidden = true; } return; }
    if (action === 'demo-remove-term') {
      const index = Number(element.dataset.index); if (Number.isInteger(index) && index >= 0 && index < demoTerms.length) { demoTerms.splice(index, 1); renderWithToast(liveWorkspaceDemoView()); toast('Term removed from this preview only.'); } return;
    }
    if (action === 'demo-clear-assistant') { demoAssistantMessages = []; renderWithToast(liveWorkspaceDemoView()); toast('Sample assistant conversation cleared.'); return; }
    if (action === 'demo-speak') { toast('Spoken translation is not connected in this UI-only preview.'); return; }
    if (action === 'demo-copy-original' || action === 'demo-copy-translation') {
      const selector = action === 'demo-copy-original' ? '#demo-original-text' : '#demo-translation-text';
      const text = document.querySelector(selector)?.innerText || '';
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); toast('Sample text copied to clipboard.'); }
      else { toast('Clipboard access is unavailable in this browser context.', 'error'); }
      return;
    }
    if (action === 'signout') {
      await api.post('/api/v1/auth/signout', {}); currentUser = null; activeWorkspace = null; go('/'); return;
    }
    if (action === 'retry') { renderRoute(); return; }
    if (action === 'analyze-rehearsal') {
      activeRehearsalNotes = '';
      const source = document.querySelector('#rehearsal-source')?.value || '';
      const scanResult = analyzeRehearsalText(source);
      activeRehearsalScan = scanResult;
      const results = document.querySelector('#rehearsal-results');
      if (results) results.innerHTML = rehearsalResultsHtml(scanResult);
      return;
    }
    if (action === 'use-rehearsal-example') {
      activeRehearsalNotes = '';
      const results = document.querySelector('#rehearsal-results'); if (results) results.innerHTML = '';
      const source = document.querySelector('#rehearsal-source');
      if (source) {
        source.value = 'The regional transport authority expects annual operating costs to increase by 18.5% by 2030, although the revised baseline assumes a 2.4°C temperature rise if investment is delayed. The International Energy Agency (IEA) estimates that the programme could require $4.2 billion over five years, while the current plan allocates only €3.6 billion.';
        source.focus();
      }
      return;
    }
    if (action === 'insert-rehearsal-notes') {
      const target = document.querySelector('#field-openQuestions');
      if (!activeRehearsalNotes || !target) { toast('Review an excerpt first.', 'error'); return; }
      const lines = activeRehearsalNotes.split('\n');
      const disclaimer = lines.pop() || 'Heuristic flags require manual verification.';
      const generalPrompts = lines.pop() || '';
      const headerLines = [];
      while (lines.length && headerLines.join('\n').length + lines[0].length < 1250) headerLines.push(lines.shift());
      const manualNotes = [...document.querySelectorAll('[data-rehearsal-answer]')].map(field => ({ index: field.dataset.sentenceIndex, text: field.value.replace(/\s+/g, ' ').trim().slice(0, 180) })).filter(item => item.text).slice(0, 5);
      const expected = document.querySelector('[data-rehearsal-anticipation="expected"]')?.value.replace(/\s+/g, ' ').trim().slice(0, 180) || '';
      const evidence = document.querySelector('[data-rehearsal-anticipation="evidence"]')?.value.replace(/\s+/g, ' ').trim().slice(0, 180) || '';
      const authoredNotes = [];
      if (manualNotes.length) {
        authoredNotes.push('INTERPRETER-AUTHORED SENTENCE PRACTICE:');
        for (const item of manualNotes) authoredNotes.push(`- Sentence ${item.index}: ${item.text}`);
      }
      if (expected) authoredNotes.push(`Context hypothesis (not a prediction): ${expected}`);
      if (evidence) authoredNotes.push(`Supporting clue / alternative: ${evidence}`);
      const report = [headerLines.join('\n'), ...authoredNotes, generalPrompts, disclaimer].filter(Boolean).join('\n').slice(0, 2400);
      const combined = target.value.trim() ? `${target.value.trim()}\n\n${report}` : report;
      if (combined.length > 3000) { toast('The preparation questions field is too full. Shorten existing notes before adding these review cues.', 'error'); return; }
      target.closest('details')?.setAttribute('open', '');
      target.value = combined;
      target.focus();
      target.scrollIntoView({ behavior: 'auto', block: 'center' });
      toast('Your review cues were inserted. Check them, then select Save preparation.');
      return;
    }
    if (action === 'workspace-tab') {
      activeTab = element.dataset.tab || 'stream';
      const layout = document.querySelector('.workspace-layout'); if (layout) layout.dataset.activeTab = activeTab;
      document.querySelectorAll('[data-action="workspace-tab"]').forEach(button => { const chosen = button.dataset.tab === activeTab; button.classList.toggle('button--primary', chosen); button.classList.toggle('button--secondary', !chosen); button.setAttribute('aria-selected', String(chosen)); });
      return;
    }
    if (action === 'assistant-prompt') {
      runAssistant(element.dataset.prompt || 'rehearse', element.dataset.location || 'preparation');
      return;
    }
    if (action === 'assistant-insert') {
      const lastAssistant = [...activeAssistantMessages].reverse().find(m => m.role === 'assistant');
      if (!lastAssistant) { toast('No assistant answer to add.', 'error'); return; }
      const location = element.dataset.location || 'preparation';
      const text = String(lastAssistant.text || '').slice(0, 1000);
      if (location === 'followup') {
        const target = document.querySelector('#field-text');
        if (!target) { toast('Open the follow-ups section first.', 'error'); return; }
        target.value = target.value.trim() ? `${target.value.trim()}\n\n${text}` : text;
        target.focus(); target.scrollIntoView({ behavior: 'auto', block: 'center' });
        toast('Assistant answer inserted into the follow-up field. Review it, then select Add follow-up to save.');
      } else {
        const target = document.querySelector('#field-openQuestions');
        if (!target) { toast('Open the preparation page first.', 'error'); return; }
        const combined = target.value.trim() ? `${target.value.trim()}\n\nASSISTANT NOTE (rules-based; verify manually):\n${text}` : `ASSISTANT NOTE (rules-based; verify manually):\n${text}`;
        if (combined.length > 3000) { toast('The preparation questions field is too full. Shorten existing notes first.', 'error'); return; }
        target.closest('details')?.setAttribute('open', '');
        target.value = combined;
        target.focus(); target.scrollIntoView({ behavior: 'auto', block: 'center' });
        toast('Assistant answer inserted into preparation questions. Review it, then select Save preparation.');
      }
      return;
    }
    if (action === 'start-session') {
      const result = await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/start`, {}); toast(result.alreadyStarted ? 'This session was already running.' : 'Session started. The timer is using the server start time.'); await loadWorkspace(id); return;
    }
    if (action === 'cancel-session') {
      if (!window.confirm('Cancel this scheduled session? The record will become read-only.')) return;
      await api.post(`/api/v1/sessions/${encodeURIComponent(id)}/cancel`, {}); toast('Session cancelled and saved.'); go('/app'); return;
    }
    if (action === 'delete-session') {
      if (!window.confirm('Permanently delete this session and all of its notes, terms, preparation and follow-ups?')) return;
      await api.delete(`/api/v1/sessions/${encodeURIComponent(id)}`); activeWorkspace = null; toast('Session and its child records were deleted.'); go('/app'); return;
    }
    if (action === 'edit-session') { go(`/sessions/${encodeURIComponent(id)}/edit`); return; }
    if (action === 'reload-session-edit') { await editSessionView(id); return; }
    if (action === 'toggle-check') {
      const sessionId = activeWorkspace?.session.id || routeParts().path.match(/^\/sessions\/([^/]+)/)?.[1];
      if (!sessionId) return;
      const key = element.dataset.key; const state = element.dataset.state || 'done';
      await api.patch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/prep-checks`, { itemKey: key, state });
      toast('Preparation checklist updated.');
      if (routeParts().path.endsWith('/prepare')) await loadPreparation(sessionId); else await refreshWorkspace(sessionId);
      return;
    }
    if (action === 'toggle-followup') {
      const sessionId = activeWorkspace?.session.id || routeParts().path.match(/^\/sessions\/([^/]+)/)?.[1];
      if (!sessionId) return;
      await api.patch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(id)}`, { status: element.dataset.status });
      toast('Follow-up status saved.');
      if (routeParts().path.endsWith('/summary')) await loadSummary(sessionId); else await refreshWorkspace(sessionId);
      return;
    }
    if (action === 'delete-entry') {
      if (!window.confirm('Delete this entry from the saved session?')) return;
      const sid = activeWorkspace?.session.id; await api.delete(`/api/v1/sessions/${encodeURIComponent(sid)}/entries/${encodeURIComponent(id)}`); toast('Entry deleted.'); await refreshWorkspace(sid); return;
    }
    if (action === 'delete-term') {
      if (!window.confirm('Delete this terminology item?')) return;
      const sid = activeWorkspace?.session.id; await api.delete(`/api/v1/sessions/${encodeURIComponent(sid)}/terms/${encodeURIComponent(id)}`); toast('Term deleted.'); await refreshWorkspace(sid); return;
    }
    if (action === 'delete-followup') {
      if (!window.confirm('Delete this follow-up?')) return;
      const sid = activeWorkspace?.session.id; await api.delete(`/api/v1/sessions/${encodeURIComponent(sid)}/followups/${encodeURIComponent(id)}`); toast('Follow-up deleted.'); await refreshWorkspace(sid); return;
    }
    if (action === 'export-json' || action === 'export-markdown') {
      const fmt = action === 'export-json' ? 'json' : 'markdown';
      const result = await api.download(`/api/v1/sessions/${encodeURIComponent(id)}/export?format=${fmt}`, `cadence-session.${fmt === 'json' ? 'json' : 'md'}`);
      toast(`${fmt === 'json' ? 'JSON' : 'Markdown'} export downloaded (${result.bytes} bytes).`); return;
    }
  } catch (error) {
    if (error.status === 401) { currentUser = null; go(`/signin?next=${encodeURIComponent(location.hash.slice(1))}`); return; }
    toast(error.message || 'The action failed. No success was reported.', 'error');
  }
}
function changeHandler(event) {
  const target = event.target;
  if (target.id === 'demo-source-language' || target.id === 'demo-target-language') {
    renderWithToast(liveWorkspaceDemoView());
  }
}
function inputHandler(event) {
  const target = event.target;
  if (target.id === 'demo-term-search') {
    const query = target.value.trim().toLocaleLowerCase();
    document.querySelectorAll('.demo-term-row').forEach(row => { row.hidden = !row.dataset.termSearch.includes(query); });
    return;
  }
  if (target.name !== 'sourceTerm') return;
  const form = target.closest('form[data-form="term-create"]'); if (!form) return;
  const warning = form.querySelector('#term-duplicate-warning'); if (!warning) return;
  const match = activeWorkspace?.terms.some(t => t.sourceTerm.toLocaleLowerCase() === target.value.trim().toLocaleLowerCase());
  warning.hidden = !match;
}

function runAssistant(prompt, location) {
  const promptLabels = { rehearse: 'What should I rehearse?', figures: 'Which figures need checking?', acronyms: 'Which acronyms are unverified?', terminology: 'Are there gaps in my terminology?', unresolved: "What's still unresolved?", closeout: 'Closeout help' };
  const label = promptLabels[prompt] || prompt;
  activeAssistantMessages.push({ role: 'user', text: label });
  const answer = assistantAnswer(prompt, { workspace: activeWorkspace, rehearsalResult: activeRehearsalScan });
  const insertable = ['rehearse', 'figures', 'acronyms', 'terminology', 'unresolved', 'closeout'].includes(prompt);
  const insertLocation = prompt === 'closeout' || prompt === 'unresolved' ? 'followup' : 'preparation';
  activeAssistantMessages.push({ role: 'assistant', text: answer.text, insertable, insertLocation });
  const isPrepare = routeParts().path.endsWith('/prepare');
  const isWorkspace = /^\/sessions\/[^/]+$/.test(routeParts().path);
  if (isPrepare) renderWithToast(preparationView(activeWorkspace));
  else if (isWorkspace) renderWorkspace(activeWorkspace);
  document.querySelector('#assistant-chat-history')?.scrollTo({ top: 99999, behavior: 'auto' });
  document.querySelector('#assistant-input')?.focus();
}

async function renderRoute() {
  routeController?.abort(); routeController = new AbortController(); stopTimer(); routeGeneration += 1;
  const generation = routeGeneration;
  const { path, query } = routeParts();
  const isProtected = path === '/app' || path === '/onboarding' || path === '/settings' || /^\/sessions\//.test(path);
  if (isProtected || ['/signin','/signup','/forgot','/reset'].includes(path) || path === '/') {
    try {
      const info = await api.get('/api/v1/auth/me', { signal: routeController.signal });
      if (generation !== routeGeneration) return;
      currentUser = info.user;
    } catch (error) {
      if (error.name === 'AbortError') return;
      currentUser = null;
    }
  }
  if (generation !== routeGeneration) return;
  if (isProtected && !currentUser) { go(`/signin?next=${encodeURIComponent(path)}`); return; }
  if (['/signin','/signup','/forgot','/reset'].includes(path) && currentUser) { go(currentUser.onboardingCompletedAt ? '/app' : '/onboarding'); return; }
  if (isProtected && currentUser && !currentUser.onboardingCompletedAt && path !== '/onboarding' && path !== '/settings') { go('/onboarding'); return; }
  if (path === '/onboarding' && currentUser?.onboardingCompletedAt) { go('/app'); return; }
  activeWorkspace = null;
  if (!path.endsWith('/prepare')) { activeRehearsalNotes = ''; activeRehearsalScan = null; }
  activeAssistantMessages = [];
  if (path === '/' || path === '') { renderWithToast(homeView()); return; }
  if (path === '/live-demo') { renderWithToast(liveWorkspaceDemoView()); return; }
  if (['/signin','/signup','/forgot','/reset'].includes(path)) { renderWithToast(authView(path.slice(1), query)); return; }
  if (path === '/onboarding') { renderWithToast(onboardingView()); return; }
  if (path === '/app') { await dashboardView(); return; }
  if (path === '/sessions/new') { renderWithToast(newSessionView()); return; }
  if (path === '/settings') { try { await loadSettings(); } catch (error) { renderWithToast(appShell(`${pageHeading('SETTINGS','Could not load account settings')} ${pageError(error.message)}`)); } return; }
  let match = /^\/sessions\/([^/]+)\/prepare$/.exec(path); if (match) { await loadPreparation(decodeURIComponent(match[1])); return; }
  match = /^\/sessions\/([^/]+)\/finish$/.exec(path); if (match) { await loadFinish(decodeURIComponent(match[1])); return; }
  match = /^\/sessions\/([^/]+)\/summary$/.exec(path); if (match) { await loadSummary(decodeURIComponent(match[1])); return; }
  match = /^\/sessions\/([^/]+)\/edit$/.exec(path); if (match) { await editSessionView(decodeURIComponent(match[1])); return; }
  match = /^\/sessions\/([^/]+)$/.exec(path); if (match) { activeTab = 'stream'; await loadWorkspace(decodeURIComponent(match[1])); return; }
  renderWithToast(`${publicNav()}<main id="main-content" class="auth-layout"><section class="auth-copy"><h1>Page not found.</h1><p>This page does not exist in the current release.</p><a class="button button--primary" href="#/app">Return to workspace</a></section></main>${publicFooter()}`);
}

root.addEventListener('submit', submitHandler);
root.addEventListener('click', clickHandler);
root.addEventListener('input', inputHandler);
root.addEventListener('change', changeHandler);
root.addEventListener('focusout', blurHandler);
window.addEventListener('hashchange', renderRoute);

renderRoute();
