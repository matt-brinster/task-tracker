# Task Manager Project Plan

## Overview
A task manager application built with TypeScript and Node.js. Supports a small number of users (family). Design priorities are speed of use and low ceremony.

Also serves as a learning vehicle for strengthening JavaScript and TypeScript skills.

## Data Model

### User
A user has:
- **id:** GUID
- **email:** string

Credentials (session tokens, verification tokens) are an infrastructure concern, not modeled in the domain. User provisioning is manual — the admin inserts rows directly into the DB.

### Task
A task has:
- **userId:** GUID. Every task belongs to a user. Tasks are siloed per user.
- **Queue:** Todo or Backlog. Todo is the default. Backlog is a low priority "someday maybe" bucket.
- **completedAt:** Nullable timestamp. Set means done.
- **snoozedUntil:** Nullable timestamp. Set and in the future means snoozed.
- **Blockers:** A collection of `{ id, title }` pairs denormalized from the blocking task. Stored as an embedded array on the task document. Not automatically cleaned up when a blocker is completed.

### Operations
There is no state machine. "Transitions" are data operations:
- **Complete:** Set `completedAt`
- **Uncomplete (undo):** Clear `completedAt`
- **Snooze:** Set `snoozedUntil`
- **Unsnooze:** Clear `snoozedUntil` (or let it expire)
- **Block:** Add blocker IDs to a task
- **Unblock:** Remove blocker IDs from a task (not automatic)
- **Promote/Demote:** Move between Todo and Backlog queues

Display logic (what status to show, how to handle a task that is both snoozed and blocked, etc.) belongs to the presentation layer, not the domain. The domain exposes raw data.

### What the Frontend Will Likely Do

The frontend receives raw task data and is responsible for:

- **Filtering into views:** e.g. "actionable" (incomplete, not snoozed, no open blockers), "snoozed", "blocked", "done"
- **Deriving display status:** its own priority logic — e.g. show "Blocked (2 open)" even if a task is also snoozed
- **Checking blockers:** iterate `blockerIds`, look up each task, decide which are open vs. complete — the API should make this cheap (e.g. return referenced blocker tasks alongside the task, or let the client query them)
- **Snooze expiry:** treat `snoozedUntil < now` as "no longer snoozed"; the domain doesn't proactively clear it
- **Undo-friendly operations:** because operations are simple data changes (not state transitions), the frontend can optimistically revert them

### Edge Cases
- Cycle detection for blocker chains is deferred
- **Blocker cleanup on delete:** When a task is deleted, its entry is removed from the `blockers` array of all tasks that reference it (immediate fan-out via `updateMany` + `$pull`). See Phase 4.
- **Blocker cleanup on completion:** Not automatic. The frontend checks whether each blocker is complete and displays accordingly. This preserves the relationship for undo (reopen).
- **Blocker title fan-out:** When a task's title changes, denormalized blocker titles on other tasks become stale. Deferred — no title update endpoint exists yet. When added, use `updateMany` with positional `$set` to fan out the new title.

### Snooze Behavior
- Expired snoozes are resolved lazily — the frontend treats `snoozedUntil < now` as "not snoozed". The domain does not proactively clear the field. No server-side scheduling needed for a web app frontend.

## Authentication

Invitation key flow. Designed for a small number of users (family). No passwords, no email delivery (yet).

### Provisioning (admin)
1. Admin creates a user with their email: `createUser(email)` → inserts into `users`
2. Admin creates an invitation linked to that user: `createInvitation(userId)` → generates a random key, stores its hash, returns the raw key
3. Admin hands the raw key to the person (text, in person, etc.)

### Redeeming (user, new device)
1. User enters their invitation key on a new device
2. `POST /auth/redeem` — hash the key, look up the invitation, verify session count < 10
3. Create a new session (hash a new random token, store it), increment the invitation's session count
4. Return the raw session token to the device
5. Device stores the session token and sends it as `Authorization: Bearer <token>` on all subsequent requests

### Auth middleware
- Extract bearer token from `Authorization` header
- Hash it, look up the session in `sessions` collection
- Set `req.userId` from the session, update `lastUsedAt`
- 401 if missing/invalid

### Design decisions
- **Invitation key ≠ session token.** The invitation key is a long-lived personal passkey used to create sessions. The session token is per-device. This separation means revoking a session doesn't invalidate the invitation, and vice versa.
- **10 sessions per invitation.** Prevents abuse while allowing plenty of devices. If a user hits the limit, admin can reset the count or issue a new invitation.
- **Token hashing.** Both invitation keys and session tokens are stored as hashes (`sha256`). Raw tokens exist only in transit (returned once to the client). A DB leak doesn't compromise active sessions.
- **No email verification on redeem.** The invitation is tied to a userId, not an email. The user doesn't need to prove email ownership to redeem — possessing the key is sufficient. Email is stored on the user for future magic link support.
- **Future: magic links.** When email delivery is added, magic links become an alternative way to create a session — the session layer is already built. The invitation key flow can coexist or be retired.

### Collections (auth)
- **`users`**: `id`, `email` (already exists)
- **`invitations`**: `id`, `userId`, `tokenHash`, `createdAt`, `sessionCount`
- **`sessions`**: `id`, `userId`, `tokenHash`, `createdAt`, `lastUsedAt`

## Storage

### Database
**MongoDB.** Good fit for the document shape of tasks, natural for embedded arrays (`blockerIds`, `sessions`), and a learning goal in its own right.

### Collections
- **`tasks`**: one document per task, `blockerIds` stored as an array field
- **`users`**: one document per user
- **`invitations`**: one document per invitation key, linked to a userId
- **`sessions`**: one document per device session, linked to a userId

### Repository Layer
A DB gateway abstracts all storage. The rest of the app works only with domain types (`Task`, `User`); the repository handles SQL, row mapping, and type conversion (e.g. timestamp strings → `Date`, blocker rows → `Set<string>`).

- **Soft-delete convention:** `findTaskById` filters out soft-deleted records by default. If a use case needs deleted records (e.g. blocker reference integrity), add a `findTaskByIdWithTrashed` variant rather than adding a flag parameter.

## Phases

### Phase 1: Core Domain Modeling (TypeScript)
- Define Task and User types
- Write pure functions for task operations (complete, snooze, block, queue changes)
- Type system enforcement where possible, runtime checks where necessary
- Full test coverage
- **Learning focus:** TypeScript fundamentals, type system, JS runtime behavior, testing

### Phase 2: REST API Layer — in progress
- HTTP framework: **Express** (v5)
- Testing: **Supertest** integration tests against real MongoDB
- Routing, validation, error handling ✅
- Auth: invitation key redemption + bearer token session middleware ✅
  - `POST /auth/redeem` — accepts invitation key, creates session, returns bearer token ✅
  - Bearer token middleware — hashes token, looks up session, sets `req.userId` ✅
  - Invitation and session domain types, repositories, and indexes ✅
  - Remaining: admin provisioning script/tooling to create users + invitations
  - Remaining: more test coverage for sessions and auth (e.g. `lastUsedAt` updates, invitation/session repository integration tests)
- Response mapping: `toTaskResponse` strips internal fields (`userId`, `deletedAt`) from API responses ✅
- Global error handler: catches unhandled errors, returns JSON `{ error: "Internal server error" }` with 500 ✅
- Request logging: middleware logs `method path status duration` to stdout ✅
- Rate limiting: per-IP on `/auth` (10 req/15 min), per-user on `/tasks` (100 req/min). `express-rate-limit` with in-memory store, skipped in test. To horizontally scale (multiple instances), swap to a shared store (e.g. `rate-limit-redis`). ✅
- **Learning focus:** Node.js async patterns, middleware, request/response lifecycle

Completed endpoints:
- `POST /auth/redeem` — redeem invitation key, returns bearer token (body: `{ key }`) ✅
- `GET /tasks/open` — list open tasks for the authenticated user ✅
- `POST /tasks` — create a task ✅
- `GET /tasks/:id` — get a single task ✅
- `DELETE /tasks/:id` — soft delete ✅
- `POST /tasks/:id/complete` — mark task complete ✅
- `POST /tasks/:id/reopen` — clear completedAt ✅
- `POST /tasks/:id/snooze` — set snoozedUntil (body: `{ until }`) ✅
- `POST /tasks/:id/wake` — clear snoozedUntil ✅
- `POST /tasks/:id/queue` — set queue (body: `{ queue }`) ✅
- `POST /tasks/:id/blockers` — add blocker (body: `{ id }`, server looks up title) ✅
- `POST /tasks/:id/blockers/remove` — remove blocker (body: `{ id }`) ✅
- `GET /tasks/open/search?q=...` — text search (open tasks only) ✅

### Phase 3: Persistence
- MongoDB integration
- Repository layer implementing the DB gateway interface
- Indexes — add alongside queries as access patterns solidify. Likely candidates:
  - `{ userId: 1, deletedAt: 1, completedAt: 1 }` — primary query: user's incomplete tasks ✅
  - `{ email: 1 }` unique — user lookup by email ✅
  - `{ userId: 1, title: "text", details: "text" }` — full-text search (userId prefix, title weight 2, details weight 1) ✅
  - `{ tokenHash: 1 }` unique on `invitations` — invitation key lookup ✅
  - `{ tokenHash: 1 }` unique on `sessions` — bearer token lookup ✅
- `ensureIndexes()` uses `createIndex` which is a no-op for identical definitions but errors if the name matches with a different definition. Changing an index shape requires dropping the old one first. Need a migration strategy for production (deferred).
- **End-to-end test needed:** duplicate email rejection (requires `ensureIndexes()` to have run)
- **Learning focus:** async I/O, MongoDB driver, document modeling, indexing

### Phase 4: Blocker Fan-out on Delete — complete
When a task is deleted, any other task referencing it as a blocker has a stale entry. Fix: immediate fan-out removes the blocker entry from all referencing tasks as part of the delete operation.

- `removeBlockerFromAll(userId, blockerId)` in task repository — `updateMany` with `$pull` ✅
- `softDeleteTask(old, deleted)` in task repository — replaces the document and calls `removeBlockerFromAll` inline ✅
- `updateTask` throws if `deletedAt` is set — enforces use of `softDeleteTask` for deletes ✅
- Sparse multikey index on `{ userId, 'blockers.id' }` for efficient fan-out queries ✅
- Integration tests: blocker removed on delete, only the deleted blocker removed when others exist ✅
- **Learning focus:** MongoDB `$pull` operator, `updateMany`, fan-out patterns, multikey indexes

**Design decisions:**
- **Inline, not background.** At family scale, an `updateMany` adds single-digit milliseconds to a delete. Background processing adds complexity and failure modes (lost fan-out on crash) without a real performance benefit. Refactorable to background later if needed.
- **Remove, not mark.** Blocker entries are fully removed rather than updated to `"[deleted]"`. A deleted task is invisible to users; a ghost blocker reference adds no value. The deletion is already recorded on the deleted task's own document.
- **Title change fan-out deferred.** There is no title update endpoint yet. When one is added, the same `updateMany` pattern applies — update `blockers.$.title` where `blockers.id` matches. The repo function can be generalized at that point.
- **Completion does not auto-remove blockers.** Completing a task does not remove it from other tasks' blocker lists. The frontend is responsible for checking whether each blocker is complete and displaying accordingly. This preserves the relationship for undo (reopen) and avoids losing information.

### Phase 5: Local Deployment
Make the app runnable outside of tests.

- Admin CLI script (`src/admin/provision.ts` + `provision-cli.ts`) — creates a user + invitation, prints the raw key. Run via `npx tsx --env-file=.env src/admin/provision-cli.ts --email matt@example.com` ✅
- `.env.example` documenting required env vars (`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_DATABASE`, `MONGO_PORT`) ✅
- Dockerfile for the app (multi-stage: install deps, compile TS, run `node dist/index.js`) ✅
- Add app service to `docker-compose.yml` so `docker compose up` gives MongoDB + API ✅
- **Learning focus:** Docker multi-stage builds, environment configuration, production Node.js

### Phase 5.5: Monorepo Restructure
Reorganize the repo into npm workspaces to support both the API and the upcoming frontend as separate packages.

- Convert to npm workspaces: root `package.json` with `"workspaces": ["packages/*"]`
- Move existing backend into `packages/api/`:
  - `src/domain/` → `packages/api/src/domain/`
  - `src/repository/` → `packages/api/src/repository/`
  - `src/api/` → `packages/api/src/routes/` (rename to avoid `packages/api/src/api/` stutter)
  - `src/admin/` → `packages/api/src/admin/`
  - `src/index.ts` → `packages/api/src/index.ts`
- `packages/api/` gets its own `package.json`, `tsconfig.json`, and `vitest.config.ts`
- Root keeps: `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `.env.test.example`, `CLAUDE.md`, `docs/`
- Update all imports from `../api/` or `./api/` → `../routes/` or `./routes/`
- Update Dockerfile `COPY` paths and build commands for the new layout
- Update provision CLI run command for new path
- Verify: `npm run build -w api`, `npm test -w api`, `docker compose up --build` all work
- **Learning focus:** npm workspaces, monorepo structure, project reorganization

### Phase 6: Frontend
Web frontend for the task manager. Single-page application — client-side routing, no SSR, no BFF. The frontend calls the API directly; builds to static files (HTML, JS, CSS).

- **Location:** `packages/web/`
- **Stack:**
  - React (via Vite) — SPA, TypeScript
  - React Router — client-side routing
  - TanStack Query — server state management (caching, refetching, loading/error states)
  - Tailwind CSS — styling
- **Interaction model:** buttons (not swipe/gesture)
- **Auth:** Login screen accepts invitation key, calls `POST /auth/redeem`, stores returned bearer token in `localStorage`. Token sent as `Authorization: Bearer <token>` header on all API calls.
- **Features (first pass):**
  - Login screen (enter invitation key → redeem → store token)
  - Main view: open tasks filtered into sections (actionable / snoozed / blocked)
  - Create task
  - Task actions: complete, reopen, snooze, wake, change queue, add/remove blocker
  - Search
- **Sub-phases:**
  - **6a: Scaffolding** — complete. ✅
    - `npm create vite` into `packages/web/`, wired up workspace
    - Installed Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/vite`), TanStack Query, React Router
    - Downgraded Vite to v7 and `@vitejs/plugin-react` to v4 (Vite 8 incompatible with `@tailwindcss/vite`)
    - Vite dev server proxies `/api` to Express backend (`localhost:3000`)
    - Stripped Vite boilerplate, replaced with hello world
    - `npm run dev -w web` starts at `localhost:5173`, `npm run build -w web` produces `dist/`
  - **6b: Auth** — Login page (text input for invitation key, submit button), call `POST /auth/redeem`, store token in `localStorage`, API client module that attaches `Bearer` header to all requests, redirect to login on 401. Verify: can log in and see a placeholder authenticated page.
  - **6c: Task list (read-only)** — Main view fetches `GET /tasks/open` via TanStack Query, filter into sections (actionable / snoozed / blocked), display task cards (title, queue, blocker count, snooze date), resolve blocker status (check each blocker's `completedAt`). Verify: logged-in user sees tasks organized into sections.
  - **6d: Task creation** — Form with title (required) and details (optional), `POST /tasks`, invalidate task list query on success. Verify: can create a task and see it appear.
  - **6e: Task actions** — Buttons on each task: complete, reopen, snooze (with date picker), wake, move to backlog/todo, add blocker (pick from open tasks), remove blocker. Each calls `POST /tasks/:id/...`. Optimistic updates or query invalidation via TanStack Query. Verify: all actions work and list updates.
  - **6f: Search** — Search input, calls `GET /tasks/open/search?q=...`, debounced or search-on-submit, results in same card format. Verify: search returns and displays results.
  - **6g: Polish & deploy** — Error states, loading indicators, empty states. Build static output, update Dockerfile / docker-compose to serve it (nginx or serve from Express). Verify: `docker compose up --build` runs full stack with frontend.
- **Learning focus:** React fundamentals, client-side routing, server state management, API integration

### Future Possibilities
- Websockets for real time updates
- Priority with a priority queue (with starvation prevention)
- Blocker title fan-out when a title update endpoint is added
- Additional features as interest dictates

## Tooling
- **OS:** Windows with WSL (Ubuntu) for development
- **IDE:** VS Code with WSL extension
- **Node.js:** Installed inside WSL; Node 22 LTS via nvm
- **Package manager:** npm (comes with Node)
- **Version control:** Git (configured inside WSL)
- **Project location:** `/mnt/c/dev/task-tracker` (Windows filesystem via WSL). `.gitattributes` normalizes line endings to LF.

## Learning Approach
- Prioritize understanding over shipping
- Surface JavaScript fundamentals underneath TypeScript
- Discuss what TS compiles to at runtime
- Smaller projects may be interspersed as needed
