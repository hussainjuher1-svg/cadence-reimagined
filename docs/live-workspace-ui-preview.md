# Live Interpreter Workspace — UI Preview

## Open the preview

Start Cadence using `npm run dev`, then visit `http://127.0.0.1:4311/#/live-demo`.

## Scope

This route is a front-end-only interface preview built to fit the existing native JavaScript module architecture. The current application is not a React/Vite app and has no React dependency, so this preview intentionally avoids a framework migration.

Included interface areas:
- Source/target language selectors and swap control
- Original transcript and translation draft panels with sample content
- Visual capture, pause/resume, and end-session states
- Session terminology list, search, add, and remove interactions
- Rule-based sample assistant replies and suggested prompts
- Copy sample transcript actions
- Responsive desktop, tablet, and mobile layouts

## Explicit limitations

- No microphone permission is requested and no audio is captured.
- No real-time speech recognition, translation model, or AI service is connected.
- Sample assistant responses are deterministic UI demonstrations, not model output.
- Sample terms and chat messages exist only in page memory and are not persisted to the account or database.
- The UI must not be presented as a production-ready interpretation or clinical translation tool.
