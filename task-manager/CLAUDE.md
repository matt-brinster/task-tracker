# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

We are pair programming. The user is at the keyboard; Claude is the navigator. The user is a professional software engineer learning Node.js and TypeScript for the first time — experienced enough to not need hand-holding, but new enough to need accurate, complete answers.

- Give direct, complete answers. No withholding information to create a "learning moment".
- Don't create exercises, quizzes, or artificial challenges.
- Do flag issues, suggest approaches, and review code proactively.
- Prioritize understanding: explain what TypeScript compiles to at runtime when it's relevant, surface JS fundamentals where they matter.

## Commands

> **Note:** These commands reflect the current (pre-restructure) layout. After Phase 5.5, commands will use workspace syntax (e.g. `npm run build -w api`, `npm test -w api`).

```bash
npm run build      # compile TypeScript (outputs to dist/)
npm run clean      # remove dist/
npm test           # run tests (Vitest, watch mode); requires .env.test
npm test -- --run  # run tests once and exit
```

**Test framework: Vitest.** Tests load `.env.test` via `node --env-file=.env.test`. Copy `.env.test.example` to `.env.test` to get started. Integration tests require MongoDB running (`docker compose up -d`).

## Project Status

**Phase 1: Core Domain Modeling** — complete.
**Phase 2: REST API Layer** — in progress.
**Phase 3: Persistence** — complete.
**Phase 4: Blocker Fan-out on Delete** — complete.
**Phase 5: Local Deployment** — complete.
**Phase 5.5: Monorepo Restructure** — planned (next).
**Phase 6: Frontend** — planned.

Completed:
- `src/domain/task.ts` — `Task` type and `createTask` factory (uses UUIDv7 for IDs)
- `src/domain/task_operations.ts` — `completeTask`, `reopenTask`, `snoozeTask`, `wakeTask`, `deleteTask`, `addBlockers`, `removeBlockers`, `setQueue`
- `src/domain/task_operations.test.ts` — full test coverage for all operations above
- `src/domain/user.ts` — `User` type and `createUser` factory (UUIDv7 IDs, lowercases/trims email)
- `src/repository/client.ts` — MongoDB client and `db()` helper
- `src/repository/task_repository.ts` — `insertTask`, `updateTask(old, updated)` (throws if `deletedAt` set), `softDeleteTask(old, deleted)` (replaces doc + inline blocker fan-out), `removeBlockerFromAll(userId, blockerId)`, `findTaskById(userId, taskId)`, `findOpenTasks(userId, limit?)`, `searchTasks(userId, query, limit?)`, document mapping (`toDocument`/`fromDocument`). Uses `task.id` as MongoDB `_id`. Queries filter out soft-deleted records by default. Text search also excludes completed tasks.
- `src/repository/user_repository.ts` — `insertUser`, `findUserById`, `findUserByEmail`
- `src/domain/crypto.ts` — `generateToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex)
- `src/domain/invitation.ts` — `Invitation` type and `createInvitation(userId)` factory. Returns `{ invitation, rawToken }` — raw token is handed out, only the hash is stored.
- `src/domain/session.ts` — `Session` type and `createSession(userId)` factory. Returns `{ session, rawToken }`.
- `src/domain/auth.test.ts` — tests for crypto, invitation, and session domain (11 tests)
- `src/repository/invitation_repository.ts` — `insertInvitation`, `findInvitationByTokenHash`, `incrementSessionCount`
- `src/repository/session_repository.ts` — `insertSession`, `findSessionByTokenHash`, `updateLastUsedAt`
- `src/repository/indexes.ts` — `ensureIndexes()`: compound index on tasks (`userId`, `deletedAt`, `completedAt`), sparse multikey index on tasks (`userId`, `blockers.id`), unique index on `users.email`, text index on tasks, unique indexes on `invitations.tokenHash` and `sessions.tokenHash`
- `src/api/rate-limit.ts` — `ipLimiter` (10 req/15 min, per-IP, for `/auth`) and `userLimiter` (100 req/min, per-userId, for `/tasks`). Uses `express-rate-limit` with in-memory store. Skipped in test via `NODE_ENV`.
- `src/api/rate-limit.test.ts` — integration tests for both limiters (2 tests, uses `vi.mock` to override with low limits)
- `src/api/app.ts` — Express app setup: JSON body parsing, request logging middleware (method, path, status, duration), rate limiting (per-IP on auth, per-user on tasks), bearer token auth middleware (hashes token → session lookup → sets `req.userId`), mounts auth routes (unauthenticated) and task routes (authenticated), global error handler (returns JSON 500). Exports `app` without calling `.listen()` (for supertest).
- `src/api/auth.ts` — auth routes. `POST /auth/redeem` — accepts `{ key }`, validates invitation, creates session, returns `{ token }`. Enforces 10-session-per-invitation limit.
- `src/api/tasks.ts` — task routes. Response mapped via `toTaskResponse` (excludes `userId`, `deletedAt`). Endpoints: `GET /tasks/open`, `POST /tasks`, `GET /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/{complete,reopen,snooze,wake,queue,blockers,blockers/remove}`, `GET /tasks/open/search?q=...`.
- `src/api/express.d.ts` — declaration merging to add `userId` to Express `Request`
- `src/api/test-helpers.ts` — `createTestSession(userId)` — inserts a session and returns raw bearer token for use in tests
- `src/api/tasks.test.ts` — supertest integration tests for all task endpoints (69 tests, bearer token auth)
- `src/api/auth.test.ts` — supertest integration tests for redeem endpoint and auth middleware (11 tests)
- `src/api/app.test.ts` — app-level middleware tests (error handler)
- `src/index.ts` — entrypoint: runs `ensureIndexes()`, starts Express on `PORT` (default 3000)
- `src/admin/provision.ts` — `provision(email)` function: creates a user + invitation, returns `{ userId, email, rawToken }`. Throws on duplicate email.
- `src/admin/provision-cli.ts` — CLI wrapper: parses `--email`, calls `provision()`, prints results. Run via `npx tsx --env-file=.env src/admin/provision-cli.ts --email name@example.com`
- `src/admin/provision.test.ts` — integration tests for provisioning (6 tests)
- `Dockerfile` — multi-stage build: deps (production `node_modules`), build (compile TS), final (slim runtime image with `node dist/index.js`)
- `.dockerignore` — excludes `node_modules`, `dist`, `.env`, `.env.test`, `*.test.ts` from build context
- `docker-compose.yml` — `mongodb` + `app` services. `docker compose up --build` runs the full stack.

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

**Monorepo** using npm workspaces (Phase 5.5, in progress):
- `packages/api/` — the backend (Express API server)
  - `src/domain/` — core types and pure functions (no I/O, no framework dependencies)
  - `src/repository/` — persistence
  - `src/routes/` — HTTP layer (Express route handlers, middleware)
  - `src/admin/` — CLI tooling (provisioning)
- `packages/web/` — the frontend (Phase 6): React SPA, Vite, React Router, TanStack Query, Tailwind CSS

> **Current state:** All source is still in the top-level `src/` directory with `src/api/` for the HTTP layer. The restructure will move everything into `packages/api/` and rename `src/api/` → `src/routes/`.

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
