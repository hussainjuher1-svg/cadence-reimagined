# Cadence — local interpretation session workspace

Cadence is a local-first workspace for professional interpreters to prepare assignments, record manual entries and terminology, track follow-ups, finish sessions and export the saved record. It does not provide live transcription or AI interpretation.

## Requirements

- Node.js **22.16.0** (the project pins this version in `.nvmrc`; compatible versions are `>=22.5.0 <23`). Node's built-in `node:sqlite` is used, so no SQLite addon/compiler is required.
- npm included with Node. The project currently has no runtime or development package dependencies.
- Windows 10/11, macOS or Linux. The default listener is restricted to `127.0.0.1`.

## Windows: extract, install and run

1. Extract `cadence-reimagined.zip` to a short writable path, for example `C:\Cadence\cadence-reimagined`. Do not run it from inside the ZIP.
2. Open PowerShell or Command Prompt and enter the extracted folder:

   ```powershell
   cd C:\Cadence\cadence-reimagined
   node --version
   npm --version
   ```

   Node should report `v22.16.0`. Install Node.js 22 LTS from the official Node.js installer if Node is missing or the version is unsupported.
3. Install from the included lockfile (no packages need to be downloaded):

   ```powershell
   npm install
   ```

4. Start the application:

   ```powershell
   npm run dev
   ```

5. Open `http://127.0.0.1:4311/` in a browser. Register your own account; no demo account is seeded.
6. Stop the server with `Ctrl+C`.

Command Prompt uses the same commands. To use another port, set `PORT` before starting it. PowerShell: `$env:PORT=4312`; cmd.exe: `set PORT=4312`. Then open the matching local URL. If the port is already in use, run `npm run doctor` and choose an unused port.

## Development checks

```powershell
npm run doctor
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

The native-module build avoids a package registry dependency. Consequently, `npm run build` verifies required files, JavaScript syntax and the client JavaScript budget; it does **not** run a Vite/TypeScript production bundler. `npm run typecheck` explicitly reports that TypeScript type checking was not executed because the configured implementation is JavaScript and npm registry access was unavailable during this build. Check `docs/test-report.md` for exact observed results rather than assuming a command passed.

## Local data, recovery and deletion

On first start, Cadence creates `data/cadence.sqlite` and applies versioned schema migrations. Keep this folder private: it contains account hashes and interpreter session records. Session text is not written into application logs. The `data/dev-outbox.jsonl` file and terminal contain password-reset URLs because this is a local development mailer; the UI explicitly says no email was sent. Treat reset URLs as temporary secrets and delete the outbox when no longer needed. Recovery links expire in 30 minutes and can be used once.

Export important completed sessions before deleting records. Session deletion and account deletion are hard deletes within this local database. Backups are not built in. Deleting the database file removes all local accounts and records, but first stop the server.

## Sample workspace

Use **Explore a sample workspace** to open one static, fictional, read-only arts-workshop example. It is separate from account data and is never included in dashboard counts, API results or exports. The banner on the sample page explains that nothing is saved.

## Known scope boundaries

This release uses native browser JavaScript modules and the Node.js built-in HTTP/SQLite APIs. React, Vite, TypeScript and an email service were not installed: the npm registry could not be reached at build time (`EAI_AGAIN registry.npmjs.org`). No downloaded package is needed to start the local implementation. See `docs/known-limitations.md`, `docs/assumptions.md` and `docs/security.md` before using it for sensitive live work.

Cadence local mode is a development workspace, **not production authentication or a claim of complete security**. Before internet-facing deployment, complete a security review, choose and configure production authentication, HTTPS, secrets handling, backups, monitoring, retention/recovery operations and a dependency audit.


## Preparation Review (focused prototype)

Open a session, choose **Edit preparation**, then use **Preparation Review** to paste a short excerpt you are permitted to process. The scan runs in the browser and flags candidate long/complex sentences, figures/units, acronyms and possible capitalized names. Select **Add compact review cues to preparation questions** to insert the short report; inspect it and select **Save preparation** if you want it stored. This is a deterministic heuristic, not AI, translation, factual verification, clause understanding or live interpretation. Avoid restricted/confidential material unless permitted.

## Product scope

Read [`docs/product-direction.md`](docs/product-direction.md), [`docs/market-evidence.md`](docs/market-evidence.md), and [`docs/ai-product-context.md`](docs/ai-product-context.md) before expanding scope. The initial target is an independent conference interpreter preparing dense technical/policy/financial/institutional material. Healthcare, remote-session troubleshooting, fatigue, agency admin and qualification guidance are later research tracks, not simultaneous MVP modules.
