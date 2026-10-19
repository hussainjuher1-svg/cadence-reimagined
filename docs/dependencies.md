# Dependency inventory

## Runtime

There are **zero third-party npm dependencies** in this package. Runtime features use Node built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:util`, `node:os`, and related standard modules) and browser-native JavaScript, HTML and CSS.

| Capability | Choice | Reason |
|---|---|---|
| HTTP server | Node built-in `http` | Simple loopback local service without Express dependency. |
| Persistent storage | Node built-in `node:sqlite` (`DatabaseSync`) | No native-addon compiler install; available in pinned Node 22.16.0, though Node prints an experimental warning. |
| Password hashing | Node `crypto.scrypt` in async API | Built-in, no dependency install, non-blocking password hashing. Parameters: N=32768/r=8/p=3, max memory 64 MiB; parameter values are embedded in the stored hash. |
| Client routing/forms | Browser-native JS modules | Works offline, no hydration/bundler needed for current scope. |
| Tests | `node:test`, built-in `assert` and `fetch` | Real HTTP integration against temporary SQLite DBs. |
| Packaging | system `zip` utility | Available in build environment; source archive excludes generated data and dependencies. |

## Deliberate stack deviation

The brief specified React + Vite + TypeScript. During preflight Node 22.16.0 and npm 10.9.2 were present, but `npm ping --fetch-timeout=8000 --fetch-retries=0` failed with `EAI_AGAIN registry.npmjs.org`. Since there are no packages cached for the requested stack, forcing an install would block delivery. The current build therefore uses dependency-free native JS modules and Node built-ins; it is not described as React/Vite/TypeScript. The registry problem and consequences are recorded in `assumptions.md` and `known-limitations.md`.

The chosen `node:sqlite` implementation is available and passed real API integration tests on the recorded Node version in Linux. Windows install/run still requires verification on a Windows machine. Node currently marks `node:sqlite` experimental, so pinning Node 22 and testing before upgrades are important.
