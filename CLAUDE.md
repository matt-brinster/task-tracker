# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

We are pair programming. The user is at the keyboard; Claude is the navigator. The user is a professional software engineer learning Node.js and TypeScript for the first time — experienced enough to not need hand-holding, but new enough to need accurate, complete answers.

- Give direct, complete answers. No withholding information to create a "learning moment".
- Don't create exercises, quizzes, or artificial challenges.
- Do flag issues, suggest approaches, and review code proactively.
- Prioritize understanding: explain what TypeScript compiles to at runtime when it's relevant, surface JS fundamentals where they matter.

## Commands

```bash
# API
npm run build -w api      # compile TypeScript (outputs to packages/api/dist/)
npm run clean -w api      # remove packages/api/dist/
npm test -w api           # run tests (Vitest, watch mode); requires packages/api/.env.test
npm test -w api -- --run  # run tests once and exit

# Web (frontend)
npm run dev -w web        # Vite dev server at localhost:5173 (proxies /api to localhost:3000)
npm run build -w web      # type-check + bundle into packages/web/dist/
npm run lint -w web       # ESLint
```

**Test framework: Vitest.** Tests load `packages/api/.env.test` via `node --env-file=.env.test`. Copy `packages/api/.env.test.example` to `packages/api/.env.test` to get started. Integration tests require MongoDB running (`docker compose up -d`).

**Provision CLI:**
```bash
npx tsx --env-file=packages/api/.env src/admin/provision-cli.ts --email name@example.com
# (run from packages/api/)
```

## Project Status

**Phase 1: Core Domain Modeling** — complete.
**Phase 2: REST API Layer** — in progress.
**Phase 3: Persistence** — complete.
**Phase 4: Blocker Fan-out on Delete** — complete.
**Phase 5: Local Deployment** — complete.
**Phase 5.5: Monorepo Restructure** — complete.
**Phase 6: Frontend** — in progress (6a scaffolding complete).

Completed:
- `packages/api/src/domain/task.ts` — `Task` type and `createTask` factory (uses UUIDv7 for IDs)
- `packages/api/src/domain/task_operations.ts` — `completeTask`, `reopenTask`, `snoozeTask`, `wakeTask`, `deleteTask`, `addBlockers`, `removeBlockers`, `setQueue`
- `packages/api/src/domain/task_operations.test.ts` — full test coverage for all operations above
- `packages/api/src/domain/user.ts` — `User` type and `createUser` factory (UUIDv7 IDs, lowercases/trims email)
- `packages/api/src/repository/client.ts` — MongoDB client and `db()` helper
- `packages/api/src/repository/task_repository.ts` — `insertTask`, `updateTask(old, updated)` (throws if `deletedAt` set), `softDeleteTask(old, deleted)` (replaces doc + inline blocker fan-out), `removeBlockerFromAll(userId, blockerId)`, `findTaskById(userId, taskId)`, `findOpenTasks(userId, limit?)`, `searchTasks(userId, query, limit?)`, document mapping (`toDocument`/`fromDocument`). Uses `task.id` as MongoDB `_id`. Queries filter out soft-deleted records by default. Text search also excludes completed tasks.
- `packages/api/src/repository/user_repository.ts` — `insertUser`, `findUserById`, `findUserByEmail`
- `packages/api/src/domain/crypto.ts` — `generateToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex)
- `packages/api/src/domain/invitation.ts` — `Invitation` type and `createInvitation(userId)` factory. Returns `{ invitation, rawToken }` — raw token is handed out, only the hash is stored.
- `packages/api/src/domain/session.ts` — `Session` type and `createSession(userId)` factory. Returns `{ session, rawToken }`.
- `packages/api/src/domain/auth.test.ts` — tests for crypto, invitation, and session domain (11 tests)
- `packages/api/src/repository/invitation_repository.ts` — `insertInvitation`, `findInvitationByTokenHash`, `incrementSessionCount`
- `packages/api/src/repository/session_repository.ts` — `insertSession`, `findSessionByTokenHash`, `updateLastUsedAt`
- `packages/api/src/repository/indexes.ts` — `ensureIndexes()`: compound index on tasks (`userId`, `deletedAt`, `completedAt`), sparse multikey index on tasks (`userId`, `blockers.id`), unique index on `users.email`, text index on tasks, unique indexes on `invitations.tokenHash` and `sessions.tokenHash`
- `packages/api/src/routes/rate-limit.ts` — `ipLimiter` (10 req/15 min, per-IP, for `/auth`) and `userLimiter` (100 req/min, per-userId, for `/tasks`). Uses `express-rate-limit` with in-memory store. Skipped in test via `NODE_ENV`.
- `packages/api/src/routes/rate-limit.test.ts` — integration tests for both limiters (2 tests, uses `vi.mock` to override with low limits)
- `packages/api/src/routes/app.ts` — Express app setup: JSON body parsing, request logging middleware (method, path, status, duration), rate limiting (per-IP on auth, per-user on tasks), bearer token auth middleware (hashes token → session lookup → sets `req.userId`), mounts auth routes (unauthenticated) and task routes (authenticated), global error handler (returns JSON 500). Exports `app` without calling `.listen()` (for supertest).
- `packages/api/src/routes/auth.ts` — auth routes. `POST /auth/redeem` — accepts `{ key }`, validates invitation, creates session, returns `{ token }`. Enforces 10-session-per-invitation limit.
- `packages/api/src/routes/tasks.ts` — task routes. Response mapped via `toTaskResponse` (excludes `userId`, `deletedAt`). Endpoints: `GET /tasks/open`, `POST /tasks`, `GET /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/{complete,reopen,snooze,wake,queue,blockers,blockers/remove}`, `GET /tasks/open/search?q=...`.
- `packages/api/src/routes/express.d.ts` — declaration merging to add `userId` to Express `Request`
- `packages/api/src/routes/test-helpers.ts` — `createTestSession(userId)` — inserts a session and returns raw bearer token for use in tests
- `packages/api/src/routes/tasks.test.ts` — supertest integration tests for all task endpoints (69 tests, bearer token auth)
- `packages/api/src/routes/auth.test.ts` — supertest integration tests for redeem endpoint and auth middleware (11 tests)
- `packages/api/src/routes/app.test.ts` — app-level middleware tests (error handler)
- `packages/api/src/index.ts` — entrypoint: runs `ensureIndexes()`, starts Express on `PORT` (default 3000)
- `packages/api/src/admin/provision.ts` — `provision(email)` function: creates a user + invitation, returns `{ userId, email, rawToken }`. Throws on duplicate email.
- `packages/api/src/admin/provision-cli.ts` — CLI wrapper: parses `--email`, calls `provision()`, prints results. Run via `npx tsx --env-file=.env src/admin/provision-cli.ts --email name@example.com` (from `packages/api/`)
- `packages/api/src/admin/provision.test.ts` — integration tests for provisioning (6 tests)
- `Dockerfile` — multi-stage build: deps (production `node_modules`), build (compile TS into `packages/api/dist/`), final (slim runtime image with `node packages/api/dist/index.js`)
- `.dockerignore` — excludes `node_modules`, `dist`, `.env`, `.env.test`, `*.test.ts` from build context
- `docker-compose.yml` — `mongodb` + `app` services. `docker compose up --build` runs the full stack.
- `.gitattributes` — normalizes line endings to LF in the repo (fixes CRLF/LF issues between Windows and WSL)

Phase 6a (frontend scaffolding):
- `packages/web/` — Vite + React + TypeScript scaffold
- `packages/web/vite.config.ts` — Vite config with `@tailwindcss/vite` plugin and dev proxy (`/api` → `http://localhost:3000`)
- `packages/web/src/index.css` — Tailwind CSS v4 via `@import "tailwindcss"`
- `packages/web/src/App.tsx` — placeholder hello world with Tailwind classes
- `packages/web/src/main.tsx` — React entrypoint, renders `<App />` into `#root`
- `packages/web/index.html` — HTML shell, loads `main.tsx` as ES module
- Key deps: `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-query`, `react-router`, `vite@7`, `@vitejs/plugin-react@4`

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

**Monorepo** using npm workspaces:
- `packages/api/` — the backend (Express API server)
  - `src/domain/` — core types and pure functions (no I/O, no framework dependencies)
  - `src/repository/` — persistence
  - `src/routes/` — HTTP layer (Express route handlers, middleware)
  - `src/admin/` — CLI tooling (provisioning)
- `packages/web/` — the frontend (Phase 6a complete): React SPA, Vite 7, React Router, TanStack Query, Tailwind CSS v4

There is **no state machine** and no derived "status" field. The domain exposes raw data; the API and UI decide how to present it. Domain predicates may be added as needed (e.g. `isComplete`, `isSnoozed`), but status display logic belongs to the presentation layer.

**Soft deletes:** `deleteTask` sets `deletedAt` and scrubs `title`/`details` (PII removal). There is no restore. Deleted task documents remain for blocker reference integrity but are invisible to users.

**Blockers:** `blockers` is a `Blocker[]` — denormalized `{ id, title }` pairs stored as an array (not a set) to allow future priority ranking. On delete, blocker entries referencing the deleted task are removed from all tasks (inline fan-out). Title fan-out is deferred until a title update endpoint exists. Completion does not auto-remove blockers — the frontend resolves blocker status.

The TypeScript config uses `module: "nodenext"`, so imports require explicit `.js` extensions even for `.ts` source files (e.g. `import { foo } from './foo.js'`). Each package has its own `tsconfig.json`; compiled output goes to `dist/` within the package.

## TypeScript Configuration

Strict settings in use beyond `"strict": true`:
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` — optional props cannot be explicitly set to `undefined`
- `verbatimModuleSyntax` — type-only imports must use `import type`
- `isolatedModules` — each file must be independently compilable
