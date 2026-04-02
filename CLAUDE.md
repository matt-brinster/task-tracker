# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

We are pair programming. The user is at the keyboard; Claude is the navigator.

- Give direct, complete answers.
- Do flag issues, suggest approaches, and review code proactively.

## Commands

```bash
# API
npm run dev -w api        # dev server with watch mode (tsx, auto-restarts on file changes)
npm run build -w api      # compile TypeScript (outputs to packages/api/dist/)
npm run clean -w api      # remove packages/api/dist/
npm test -w api           # run tests (Vitest, watch mode); requires packages/api/.env.test
npm test -w api -- --run  # run tests once and exit

# Web (frontend)
npm run dev -w web        # Vite dev server at localhost:5173 (proxies /api to localhost:3000)
npm run build -w web      # type-check + bundle into packages/web/dist/
npm run lint -w web       # ESLint
npm test -w web           # run tests (Vitest, watch mode)
npm test -w web -- --run  # run tests once and exit
```

**Test framework: Vitest.** Tests load `packages/api/.env.test` via `node --env-file=.env.test`. Copy `packages/api/.env.test.example` to `packages/api/.env.test` to get started. Integration tests require MongoDB running (`podman compose up -d`).

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
**Phase 6: Frontend** — in progress (6a–6c complete, search complete, backlog complete, banner/navigation complete, blockers complete; remaining features are independent: snooze, deploy).

Completed:
- `packages/api/src/domain/task.ts` — `Task` type (includes `sortOrder: string`), `CreateTaskOptions` type, and `createTask(userId, title, options?)` factory (uses UUIDv7 for IDs)
- `packages/api/src/domain/task_operations.ts` — `completeTask`, `reopenTask` (clears `completedAt` and `archivedAt`), `snoozeTask`, `wakeTask`, `deleteTask`, `addBlockers`, `removeBlockers`, `setQueue`, `archiveTask`, `reorderTask`
- `packages/api/src/domain/task_operations.test.ts` — full test coverage for all operations above (45 tests)
- `packages/api/src/domain/user.ts` — `User` type and `createUser` factory (UUIDv7 IDs, lowercases/trims email)
- `packages/api/src/repository/client.ts` — MongoDB client and `db()` helper
- `packages/api/src/repository/task_repository.ts` — `insertTask`, `updateTask(old, updated)` (throws if `deletedAt` set; inline fan-out: propagates title changes to all denormalized blocker references via `updateBlockerTitleInAll`), `softDeleteTask(old, deleted)` (replaces doc + inline blocker fan-out via `removeBlockerFromAll`), `removeBlockerFromAll(userId, blockerId)`, `updateBlockerTitleInAll(userId, blockerId, title)`, `findTaskById(userId, taskId)`, `findOpenTasks(userId, limit?)`, `findActiveTasks(userId, limit?)` (unarchived + non-deleted, includes completed), `archiveTasks(userId, taskIds, at)` (bulk sets `archivedAt`), `searchOpenTasks(userId, query, limit?)` (non-deleted, non-completed, `$text` search, sorted by text relevance), `searchAllTasks(userId, query, limit?)` (non-deleted only — includes completed and archived, sorted by text relevance), `findMaxSortOrder(userId)`, `findMinSortOrder(userId)`, document mapping (`toDocument`/`fromDocument`). Uses `task.id` as MongoDB `_id`. Queries filter out soft-deleted records by default. List queries sort by `sortOrder`; search queries sort by `textScore`. `fromDocument` uses `?? null` for `archivedAt` and `?? "a0"` for `sortOrder` to handle pre-existing documents without those fields.
- `packages/api/src/repository/user_repository.ts` — `insertUser`, `findUserById`, `findUserByEmail`
- `packages/api/src/domain/crypto.ts` — `generateToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex)
- `packages/api/src/domain/invitation.ts` — `Invitation` type and `createInvitation(userId)` factory. Returns `{ invitation, rawToken }` — raw token is handed out, only the hash is stored.
- `packages/api/src/domain/session.ts` — `Session` type and `createSession(userId)` factory. Returns `{ session, rawToken }`.
- `packages/api/src/domain/auth.test.ts` — tests for crypto, invitation, and session domain (11 tests)
- `packages/api/src/repository/invitation_repository.ts` — `insertInvitation`, `findInvitationByTokenHash`, `incrementSessionCount`
- `packages/api/src/repository/session_repository.ts` — `insertSession`, `findSessionByTokenHash`, `updateLastUsedAt`
- `packages/api/src/repository/indexes.ts` — `ensureIndexes()`: compound indexes on tasks (`userId`, `deletedAt`, `completedAt`), (`userId`, `deletedAt`, `archivedAt`), and (`userId`, `deletedAt`, `sortOrder`), sparse multikey index on tasks (`userId`, `blockers.id`), unique index on `users.email`, text index on tasks, unique indexes on `invitations.tokenHash` and `sessions.tokenHash`
- `packages/api/src/routes/rate-limit.ts` — `ipLimiter` (10 req/15 min, per-IP, for `/auth`) and `userLimiter` (100 req/min, per-userId, for `/tasks`). Uses `express-rate-limit` with in-memory store. Skipped in test via `NODE_ENV`.
- `packages/api/src/routes/rate-limit.test.ts` — integration tests for both limiters (2 tests, uses `vi.mock` to override with low limits)
- `packages/api/src/routes/app.ts` — Express app setup: JSON body parsing, request logging middleware (method, path, status, duration), rate limiting (per-IP on auth, per-user on tasks), bearer token auth middleware (hashes token → session lookup → sets `req.userId`), mounts auth routes (unauthenticated) and task routes (authenticated), global error handler (returns JSON 500). Exports `app` without calling `.listen()` (for supertest).
- `packages/api/src/routes/auth.ts` — auth routes. `POST /auth/redeem` — accepts `{ key }`, validates invitation, creates session, returns `{ token }`. Enforces 10-session-per-invitation limit.
- `packages/api/src/routes/tasks.ts` — task routes. Response mapped via `toTaskResponse` (excludes `userId`, `deletedAt`; includes `archivedAt`, `sortOrder`). Endpoints: `GET /tasks/open`, `GET /tasks/active` (unarchived, non-deleted — includes completed), `POST /tasks/archive` (accepts `{ taskIds }`, bulk archive), `POST /tasks` (accepts optional `position: "top" | "bottom"`, default bottom), `GET /tasks/:id`, `PATCH /tasks/:id` (accepts optional `{ title, details }` for partial updates), `DELETE /tasks/:id`, `POST /tasks/:id/{complete,reopen,snooze,wake,queue,blockers,blockers/remove,reorder}`, `GET /tasks/open/search?q=...` (open tasks only), `GET /tasks/search?q=...` (all non-deleted tasks including archived/completed). `POST /tasks/:id/reorder` accepts `{ afterId, beforeId }` (nullable) and computes a new fractional sort key between the two neighbors. `POST /tasks/:id/blockers` rejects attempts to add a task as its own blocker (400).
- `packages/api/src/routes/express.d.ts` — declaration merging to add `userId` to Express `Request`
- `packages/api/src/routes/test-helpers.ts` — `createTestSession(userId)` — inserts a session and returns raw bearer token for use in tests
- `packages/api/src/routes/tasks.test.ts` — supertest integration tests for all task endpoints (270 tests, bearer token auth)
- `packages/api/src/routes/auth.test.ts` — supertest integration tests for redeem endpoint and auth middleware (11 tests)
- `packages/api/src/routes/app.test.ts` — app-level middleware tests (error handler)
- `packages/api/src/index.ts` — entrypoint: runs `ensureIndexes()`, starts Express on `PORT` (default 3000)
- `packages/api/src/admin/provision.ts` — `provision(email)` function: creates a user + invitation, returns `{ userId, email, rawToken }`. Throws on duplicate email.
- `packages/api/src/admin/provision-cli.ts` — CLI wrapper: parses `--email`, calls `provision()`, prints results. Run via `npx tsx --env-file=.env src/admin/provision-cli.ts --email name@example.com` (from `packages/api/`)
- `packages/api/src/admin/provision.test.ts` — integration tests for provisioning (6 tests)
- `Dockerfile` — multi-stage build: deps (production `node_modules`), build (compile TS into `packages/api/dist/`), final (slim runtime image with `node packages/api/dist/index.js`)
- `.dockerignore` — excludes `node_modules`, `dist`, `.env`, `.env.test`, `*.test.ts` from build context
- `docker-compose.yml` — `mongodb` + `app` services. `podman compose up --build` runs the full stack.
- `.gitattributes` — normalizes line endings to LF in the repo (fixes CRLF/LF issues between Windows and WSL)

Phase 6a (frontend scaffolding):
- `packages/web/` — Vite + React + TypeScript scaffold
- `packages/web/vite.config.ts` — Vite config with `@tailwindcss/vite` plugin and dev proxy (`/api` → `http://localhost:3000`)
- `packages/web/src/index.css` — Tailwind CSS v4 via `@import "tailwindcss"`
- `packages/web/src/App.tsx` — placeholder hello world with Tailwind classes
- `packages/web/src/main.tsx` — React entrypoint, renders `<App />` into `#root`
- `packages/web/index.html` — HTML shell, loads `main.tsx` as ES module
- Key deps: `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-query`, `react-router`, `use-debounce`, `@dnd-kit/react`, `vite@7`, `@vitejs/plugin-react@4`

Phase 6b (auth):
- `packages/web/src/auth.ts` — `getToken()`, `setToken()`, `clearToken()` wrapping `localStorage`
- `packages/web/src/api.ts` — `fetchApi(path, options)` attaches `Bearer` header; on 401, clears token and dispatches `auth:logout` custom event (no page reload). `redeemInvitation(key)` calls `POST /auth/redeem`. `fetchActiveTasks()`, `archiveTasks(taskIds)`, `searchTasks(q)` (calls `GET /tasks/search`), `updateTask(id, { title?, details? })`, `reorderTask(id, beforeId, afterId)` (calls `POST /tasks/:id/reorder`), `fetchTask(id)` returns `Promise<TaskResponse | null>` (null on 404), `addBlocker(taskId, blockerId)`, `removeBlocker(taskId, blockerId)`, plus CRUD task functions.
- `packages/web/src/App.tsx` — conditional rendering based on auth state and current view (`list` | `detail` | `search`). Listens for `auth:logout` event to handle expired/invalid tokens gracefully.
- `packages/web/src/pages/LoginPage.tsx` — invitation key form, calls `redeemInvitation`, stores token on success
- `packages/web/src/hooks/useTaskMutations.ts` — shared hook returning `completeMutation` and `reopenMutation` (both invalidate `['tasks']` queries on success)
- `packages/web/src/components/BackButton.tsx` — shared back button (upward chevron SVG), accepts `onClick` and optional `className`
- `packages/web/src/components/Checkbox.tsx` — shared task checkbox (checked/unchecked with checkmark SVG), derives aria-label from `displayTitle` and `checked`, supports optional `disabled` prop
- `packages/web/src/components/SectionDivider.tsx` — centered label with horizontal lines on each side
- `packages/web/src/components/Loading.tsx` — centered "Loading..." state
- `packages/web/src/components/ErrorMessage.tsx` — centered error message with configurable text
- `packages/web/src/pages/TaskListPage.tsx` — main task list, uses `fetchActiveTasks`. Top banner: search icon (left), archive icon + gear icon (right); same `px-4 py-3 border-b` header pattern as detail/search pages. Todo section: actionable tasks (todo queue, not snoozed, not blocked) with `+ Task` button. Backlog section: backlog-queue tasks (same filters) with `+ Backlog` button. Each section wrapped in its own `DragDropProvider` (from `@dnd-kit/react`) — separate providers enforce within-group reordering only. Each task row rendered as `SortableTaskRow` (uses `useSortable` hook) with a grip handle; `handleOnDragEnd` fires `reorderTask` mutation on drop. Grip is detached during a pending reorder mutation to prevent concurrent reorders. Checkbox toggles complete/reopen. Completed tasks in both sections stay visible until archived.
- `packages/web/src/pages/TaskDetailPage.tsx` — task detail/edit view. Unified flow for new and existing tasks: title and details are always editable with debounced autosave (`use-debounce`). New tasks created on first non-empty title; subsequent edits PATCHed. Queue toggle (segmented Todo/Backlog radio group) — for new tasks sets queue on create, for existing tasks calls `POST /tasks/:id/queue`. Delete button always visible. No explicit "Create" or "Save" button.
- `packages/web/src/pages/SearchPage.tsx` — search view. Debounced text input (`use-debounce`, 300ms); empty input shows no results. Results include all non-deleted tasks (archived and completed). Checkbox toggles complete/reopen (reopening also clears `archivedAt`). Clicking a row navigates to task detail. Archived/completed tasks dimmed.
- `packages/web/src/pages/SettingsPage.tsx` — settings page. Same header pattern as search/detail (back button left, "Settings" title centered). Logout button in the body (clears token, calls `onLogout`).
- `packages/web/src/auth.test.ts` — tests for token helpers (4 tests)
- `packages/web/src/api.test.ts` — tests for all API functions (28 tests)
- `packages/web/src/App.test.tsx` — tests for auth guard rendering and backlog button (3 tests)
- `packages/web/src/pages/LoginPage.test.tsx` — tests for login form submission and error display (4 tests)
- `packages/web/src/pages/TaskListPage.test.tsx` — tests for task list page (24 tests)
- `packages/web/src/pages/TaskDetailPage.test.tsx` — tests for task detail page and queue toggle (22 tests)
- `packages/web/src/pages/SearchPage.test.tsx` — tests for search page (10 tests)
- `packages/web/src/pages/SettingsPage.test.tsx` — tests for settings page (3 tests)
- `packages/web/vitest.config.ts` — Vitest config with jsdom environment (no react plugin needed — vitest uses esbuild for JSX)
- `packages/web/src/test-setup.ts` — React Testing Library cleanup between tests; stubs `ResizeObserver` (required by `@dnd-kit/react`, not provided by jsdom)

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

**Monorepo** using npm workspaces:
- `packages/api/` — the backend (Express API server)
  - `src/domain/` — core types and pure functions (no I/O, no framework dependencies)
  - `src/repository/` — persistence
  - `src/routes/` — HTTP layer (Express route handlers, middleware)
  - `src/admin/` — CLI tooling (provisioning)
- `packages/web/` — the frontend (Phase 6c + search complete): React SPA, Vite 7, TanStack Query, Tailwind CSS v4. No client-side routing — all UI renders at `/`, using conditional rendering based on auth state (`list` | `detail` | `search` views). Mobile-first layout: UI constrained to a narrow centered column (`max-w-md`) on all screen sizes. Working: auth, task list, create/edit, complete/reopen, delete, archive, search, backlog (queue toggle + backlog section), drag-and-drop reordering (within todo and backlog sections independently). Remaining independent features: blockers, snooze.

There is **no state machine** and no derived "status" field. The domain exposes raw data; the API and UI decide how to present it. Domain predicates may be added as needed (e.g. `isComplete`, `isSnoozed`), but status display logic belongs to the presentation layer.

**Soft deletes:** `deleteTask` sets `deletedAt` and scrubs `title`/`details` (PII removal). There is no restore. Deleted task documents remain for blocker reference integrity but are invisible to users.

**Archive:** `archivedAt` is a timestamp on `Task`. Completed tasks stay visible in the main list until the user explicitly archives them (via bulk `POST /tasks/archive` with an array of task IDs). This avoids cache invalidation problems — completing a task doesn't remove it from the query. Archived tasks are reachable via search (`GET /tasks/search`). `reopenTask` clears both `completedAt` and `archivedAt` — reopening an archived task brings it back to the active list. The frontend uses `GET /tasks/active` (unarchived, non-deleted) as its primary list endpoint. `GET /tasks/open` (non-completed, non-deleted) is retained for now but will be removed after blocker work is done.

**Blockers:** `blockers` is a `Blocker[]` — denormalized `{ id, title }` pairs stored as an array (not a set) to allow future priority ranking. On delete, blocker entries referencing the deleted task are removed from all tasks (inline fan-out). Title fan-out is deferred until a title update endpoint exists. Completion does not auto-remove blockers — the frontend resolves blocker status.

The TypeScript config uses `module: "nodenext"`, so imports require explicit `.js` extensions even for `.ts` source files (e.g. `import { foo } from './foo.js'`). Each package has its own `tsconfig.json`; compiled output goes to `dist/` within the package.

## TypeScript Configuration

Strict settings in use beyond `"strict": true`:
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` — optional props cannot be explicitly set to `undefined`
- `verbatimModuleSyntax` — type-only imports must use `import type`
- `isolatedModules` — each file must be independently compilable
