# Task Manager Project Plan

## Overview
A task manager application built with TypeScript and Node.js. Supports a small number of users (family). Design priorities are speed of use and low ceremony.

## Data Model

### User
A user has:
- **id:** GUID
- **email:** string
- **isAdmin:** boolean (default `false`)

Credentials (session tokens, email codes) are an infrastructure concern, not modeled in the domain. The first user is provisioned via CLI and marked as admin. Subsequent users are created through the admin page.

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
- **Blocker title fan-out:** When a task's title changes, `updateTask` in the repository calls `updateBlockerTitleInAll` to propagate the new title to all denormalized blocker references via `updateMany` with positional `$set`. ✅

### Snooze Behavior
- Expired snoozes are resolved lazily — the frontend treats `snoozedUntil < now` as "not snoozed". The domain does not proactively clear the field. No server-side scheduling needed for a web app frontend.

## Authentication

Designed for a small number of users (family). No passwords. Auth evolves in three stages:

### Stage 1: Invitation key flow (current, temporary)
The bootstrap mechanism. Admin provisions users via CLI, hands out a long random invitation key. User enters key → gets a session token. This is the only way to log in until email codes are built.

#### Provisioning (admin)
1. Admin creates a user with their email: `createUser(email)` → inserts into `users`
2. Admin creates an invitation linked to that user: `createInvitation(userId)` → generates a random key, stores its hash, returns the raw key
3. Admin hands the raw key to the person (text, in person, etc.)

#### Redeeming (user, new device)
1. User enters their invitation key on a new device
2. `POST /auth/redeem` — hash the key, look up the invitation, verify session count < 10
3. Create a new session (hash a new random token, store it), increment the invitation's session count
4. Return the raw session token to the device
5. Device stores the session token and sends it as `Authorization: Bearer <token>` on all subsequent requests

### Stage 2: Email codes (replaces invitation keys)
Admin sends an 8-digit code to a user's email from the admin page. User enters the code on the login screen to get a session. Codes are hashed (like invitation keys), single-use, and expire after 4 hours.

#### Flow
1. Admin opens admin page → enters email for a new or existing user → triggers "send code"
2. Server generates an 8-digit numeric code, hashes it, stores it with `userId`, `expiresAt` (4 hours), sends the raw code via email
3. User opens login screen → enters email → enters the code from their email → gets a session token

#### Email-only login (replaces code entry with email prompt)
Once email codes are live, the login screen changes to "enter your email":
1. User enters their email address
2. If the email is known, server generates a fresh code and emails it. If unknown, server does nothing. **Both cases return the same success response** (no user enumeration).
3. User enters the code from their email → gets a session token
4. Code expiry tightens to 15 minutes (since codes are now on-demand, not pre-sent by admin)

### Stage 3: Retire invitation keys
Once email login is stable, the invitation key flow and `invitations` collection can be removed. The first user is still bootstrapped via CLI (creates user + marks as admin), but all subsequent users are created through the admin page.

### Auth middleware (unchanged across stages)
- Extract bearer token from `Authorization` header
- Hash it, look up the session in `sessions` collection
- Set `req.userId` from the session, update `lastUsedAt`
- 401 if missing/invalid

### Admin authorization
- `isAdmin` boolean on User (default `false`). The CLI provisioning script sets `isAdmin: true` for the first user.
- Admin API routes check `isAdmin` via middleware. Non-admin users get 403.
- Admin can: create users, send email codes, view user list. Future: manage sessions, revoke access.

### Design decisions
- **Invitation keys are temporary.** They exist to bootstrap auth before email is available. Once email codes work, invitation keys are retired.
- **Token hashing.** Both codes and session tokens are stored as hashes (`sha256`). Raw values exist only in transit. A DB leak doesn't compromise active sessions.
- **Silent failure on unknown email.** `POST /auth/send-code` returns 200 regardless of whether the email is known. Prevents user enumeration.
- **8-digit numeric codes.** Easy to type from a phone reading an email. ~26 bits of entropy — adequate given expiry window and rate limiting on `/auth`.
- **Single-use codes.** A code is consumed when redeemed. To log in on another device, request a new code.

### Collections (auth)
- **`users`**: `id`, `email`, `isAdmin`
- **`invitations`**: `id`, `userId`, `tokenHash`, `createdAt`, `sessionCount` — **to be retired after email codes are live**
- **`email_codes`**: `id`, `userId`, `codeHash`, `createdAt`, `expiresAt`, `redeemedAt` — replaces invitations
- **`sessions`**: `id`, `userId`, `tokenHash`, `createdAt`, `lastUsedAt`

## Storage

### Database
**MongoDB.** Good fit for the document shape of tasks, natural for embedded arrays (`blockerIds`, `sessions`).

### Collections
- **`tasks`**: one document per task, `blockers` stored as an embedded array of `{ id, title }` pairs
- **`users`**: one document per user, includes `isAdmin` flag
- **`invitations`**: one document per invitation key, linked to a userId — **to be retired**
- **`email_codes`**: one document per email code, linked to a userId — replaces invitations
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

### Phase 4: Blocker Fan-out on Delete — complete
When a task is deleted, any other task referencing it as a blocker has a stale entry. Fix: immediate fan-out removes the blocker entry from all referencing tasks as part of the delete operation.

- `removeBlockerFromAll(userId, blockerId)` in task repository — `updateMany` with `$pull` ✅
- `softDeleteTask(old, deleted)` in task repository — replaces the document and calls `removeBlockerFromAll` inline ✅
- `updateTask` throws if `deletedAt` is set — enforces use of `softDeleteTask` for deletes ✅
- Sparse multikey index on `{ userId, 'blockers.id' }` for efficient fan-out queries ✅
- Integration tests: blocker removed on delete, only the deleted blocker removed when others exist ✅

**Design decisions:**
- **Inline, not background.** At family scale, an `updateMany` adds single-digit milliseconds to a delete. Background processing adds complexity and failure modes (lost fan-out on crash) without a real performance benefit. Refactorable to background later if needed.
- **Remove, not mark.** Blocker entries are fully removed rather than updated to `"[deleted]"`. A deleted task is invisible to users; a ghost blocker reference adds no value. The deletion is already recorded on the deleted task's own document.
- **Title change fan-out.** Implemented in `updateTask` in the repository — if the title changed, calls `updateBlockerTitleInAll` inline after replacing the document. Same pattern as delete fan-out.
- **Completion does not auto-remove blockers.** Completing a task does not remove it from other tasks' blocker lists. The frontend is responsible for checking whether each blocker is complete and displaying accordingly. This preserves the relationship for undo (reopen) and avoids losing information.

### Phase 5: Local Deployment
Make the app runnable outside of tests.

- Admin CLI script (`src/admin/provision.ts` + `provision-cli.ts`) — creates a user + invitation, prints the raw key. Run via `npx tsx --env-file=.env src/admin/provision-cli.ts --email matt@example.com` ✅
- `.env.example` documenting required env vars (`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_DATABASE`, `MONGO_PORT`) ✅
- Dockerfile for the app (multi-stage: install deps, compile TS, run `node dist/index.js`) ✅
- Add app service to `docker-compose.yml` so `docker compose up` gives MongoDB + API ✅

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

### Phase 6: Frontend
Web frontend for the task manager. Single-page application — client-side routing, no SSR, no BFF. The frontend calls the API directly; builds to static files (HTML, JS, CSS).

- **Location:** `packages/web/`
- **Stack:**
  - React (via Vite) — SPA, TypeScript
  - React Router — client-side routing
  - TanStack Query — server state management (caching, refetching, loading/error states)
  - Tailwind CSS — styling
- **Interaction model:** buttons (not swipe/gesture)
- **Layout:** Mobile-first. The UI is constrained to a narrow column (`max-w-md`, 448px) centered on desktop, so the experience is identical on phone and desktop. No responsive breakpoints or desktop-specific layouts.
- **Auth:** Login screen accepts invitation key (temporary) or email code (future), creates a session, stores bearer token in `localStorage`. Token sent as `Authorization: Bearer <token>` header on all API calls.
- **Features:**
  - Login screen (invitation key → email code → email-based login, evolves in stages)
  - Main view: tasks filtered into sections (actionable / snoozed / blocked / backlog)
  - Create task, edit task (autosave)
  - Task actions: complete, reopen, snooze, wake, change queue, add/remove blocker
  - Search
  - Admin page: user management, send email codes
- **Completed sub-phases:**
  - **6a: Scaffolding** ✅
    - `npm create vite` into `packages/web/`, wired up workspace
    - Installed Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/vite`), TanStack Query, React Router
    - Downgraded Vite to v7 and `@vitejs/plugin-react` to v4 (Vite 8 incompatible with `@tailwindcss/vite`)
    - Vite dev server proxies `/api` to Express backend (`localhost:3000`)
    - Stripped Vite boilerplate, replaced with hello world
    - `npm run dev -w web` starts at `localhost:5173`, `npm run build -w web` produces `dist/`
  - **6b: Auth** ✅
    - Login page (invitation key input, submit), calls `POST /auth/redeem`, stores token in `localStorage`
    - API client (`api.ts`) attaches `Bearer` header to all requests, clears token and dispatches `auth:logout` on 401
    - Auth helpers (`auth.ts`) wrap `localStorage` for token get/set/clear
    - No client-side routing — conditional rendering at `/` based on auth state
    - 16 tests across auth, api, App, and LoginPage
  - **6c: Task list + creation + core actions** ✅
    - Task list page: fetches `GET /tasks/active` via TanStack Query, filters to actionable tasks (todo queue, not snoozed, not blocked)
    - Task detail page: unified create/edit with debounced autosave — new tasks created on first non-empty title, subsequent edits PATCHed
    - Complete/reopen via checkbox (list and detail page)
    - Delete via detail page
    - Archive completed tasks (bulk `POST /tasks/archive`)
    - Shared components: Checkbox, SectionDivider, Loading, ErrorMessage
    - Logout
  - **6d: Search** ✅
    - `reopenTask` domain operation now clears both `completedAt` and `archivedAt` — reopening brings a task back to the active list
    - `searchOpenTasks` (renamed from `searchTasks`) — non-deleted, non-completed `$text` search; used by `GET /tasks/open/search` (blocker picker)
    - `searchAllTasks` — non-deleted `$text` search including archived and completed; used by `GET /tasks/search`
    - `SearchPage` — debounced search input, results show all non-deleted tasks with checkbox (complete/reopen) and row click to detail. Empty input = no results shown.
    - "Search" button in task list settings section navigates to search view
    - Note: `$text` requires whole words. Atlas Search (Lucene) planned for prefix/fuzzy support at deploy time — see Future Possibilities.
- **Remaining features** — these are independent of each other and can be tackled in any order:
  - **Backlog** ✅ — Segmented Todo/Backlog toggle on task detail page. Always-visible Backlog section on task list with `+ Backlog` button. New tasks created with queue matching how user got there (`+ Task` = todo, `+ Backlog` = backlog); toggle works before and after save. `setQueue` API client calls `POST /tasks/:id/queue` for existing tasks. Completed backlog tasks stay visible until archived.
  - **Blockers** ✅ — Blocker display on task detail page (list of blocking tasks with completion status). Add blocker (task picker/search using `GET /tasks/open/search` to select from open tasks). Remove blocker. Blocked section on task list (tasks with unresolved blockers). API: `POST /tasks/:id/blockers` (rejects self-blocker with 400), `POST /tasks/:id/blockers/remove`. Blocker title fan-out: `updateTask` in the repository propagates title changes to all denormalized blocker references inline (same pattern as delete fan-out). `fetchTask` returns `null` on 404.
  - **Snooze** ✅ — Snooze UI on task detail page. Three preset buttons (1 Hour, 1 Day, 1 Week) plus a "Pick date" button that expands to show a native `datetime-local` picker. All interactions auto-save immediately. Presets update the picker value and snooze in one click. "Clear Snooze" button dismisses and wakes the task. Collapsed state shows just the presets and "Pick date"; expanded state shows presets, picker, and clear button. Snoozed section on task list (tasks where `snoozedUntil > now`). API: `POST /tasks/:id/snooze`, `POST /tasks/:id/wake` (already exist).
    - Part 1: 1 hour snooze ✅
    - Part 2: user selectable snooze time (days/hours/minutes) ✅ — preset buttons (1h/1d/1w)
    - Part 3: Date/time picker ✅ — native `datetime-local`, presets update picker value
  - **Prioritization** ✅ — `sortOrder: string` field on Task using fractional indexing (`fractional-indexing` library). `POST /tasks` accepts optional `position: "top" | "bottom"` (default bottom). `POST /tasks/:id/reorder` accepts `{ afterId, beforeId }` (nullable) and computes a new key between neighbors. Drag-and-drop on task list page (`@dnd-kit/react`): separate `DragDropProvider` per section enforces within-group reordering only; grip handle detached during pending mutation to prevent concurrent reorders.
  - **Banner and Navigation** ✅ — Top banner on task list: search icon (left), archive icon + gear icon (right). Gear navigates to a full SettingsPage (same header pattern as search/detail). Logout lives on the settings page.
  - **Admin page** — Admin-only UI and API. Add `isAdmin` to User model, admin auth middleware (403 for non-admins). Admin page: list users, create new user (enter email → user created). Initially triggers invitation key generation (displayed to admin); later triggers email code send. API: `GET /admin/users`, `POST /admin/users` (creates user), `POST /admin/users/:id/send-code` (sends email code, added with email system). Frontend: new page accessible only to admin users, navigation from settings section. Independent of task features; depends on deploy only if email is needed.
  - **Email codes** — Replace invitation keys with 8-digit numeric codes. New `email_codes` collection (`id`, `userId`, `codeHash`, `createdAt`, `expiresAt`, `redeemedAt`). New domain type and factory (`createEmailCode`). Repository: `insertEmailCode`, `findEmailCodeByHash`, `markRedeemed`. New endpoint `POST /auth/redeem-code` (accepts `{ code }`, validates, creates session). Email service: Resend or SendGrid (both have free tiers sufficient for this scale). Local dev: console log transport (log code to stdout) or Mailpit in docker-compose — no real emails in dev/test. Admin triggers send from admin page. Codes: 8-digit numeric, single-use, 4-hour expiry. **Depends on:** admin page (for send UI), deploy (for email service config).
  - **Email-based login** — Rework login screen from "enter invitation key" to "enter your email." `POST /auth/send-code` accepts `{ email }`, always returns 200 (silent failure on unknown email). If email is known, generates a fresh code and sends it. Login becomes two-step: enter email → enter code. Code expiry tightens to 15 minutes. **Depends on:** email codes.
  - **Retire invitation keys** — Remove invitation key flow, `POST /auth/redeem` endpoint, `invitations` collection, and related code. **Depends on:** email-based login being stable.
  - **Deploy** — Build static output, update Dockerfile / docker-compose to serve frontend (nginx or serve from Express). Verify: `docker compose up --build` runs full stack with frontend.

### Future Possibilities
- **Atlas Search (Lucene) for search** — swap `$text` for `$search` in `searchOpenTasks` and `searchAllTasks` (`task_repository.ts`) and remove the `tasks_text` index from `indexes.ts` (Atlas Search indexes are defined in the Atlas UI). Behavior change: prefix/fuzzy matching instead of whole-word only — users can find results mid-type rather than needing to finish the word. Aligns naturally with the Atlas deployment. See TODO comment in `task_repository.ts` for the query shape.
- **Android port** — Side-loaded Android app? Widget?
- **Grocery list** — Ideally on the lock screen? Maybe a different app using the same stack.
- **Move to/from Backlog with Drag and Drop** — Library problems prevented an easy win. It may be more trouble than it is worth, but let's see if it looks like a gap after the rest of the features are in place.
- **Feature toggles** — This thing is turning out to be very feature rich. Maybe allow for opt outs.
- **Blocker enhancements** 
  - New task can get blockers too
  - Allow reordering of blocked items
  - Allow reordering of blockers (How without inviting fat-finger mistakes? Swipes? )

## Tooling
- **OS:** Windows with WSL (Ubuntu) for development
- **IDE:** VS Code with WSL extension
- **Node.js:** Installed inside WSL; Node 22 LTS via nvm
- **Package manager:** npm (comes with Node)
- **Version control:** Git (configured inside WSL)
- **Project location:** `/mnt/c/dev/task-tracker` (Windows filesystem via WSL). `.gitattributes` normalizes line endings to LF.

