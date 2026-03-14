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
- Stale blocker ID cleanup (blockers pointing to completed tasks) is deferred
- **Blocker title fan-out:** When a task's title changes, denormalized blocker titles on other tasks become stale. Plan: async fan-out in the repo layer (using `updateMany` with positional `$set`) with a warning log if the affected count is high. Deferred until logging is in place. Long-term, move to async/background fan-out.

### Snooze Behavior
- Short term: expired snoozes are resolved lazily on task lookup
- Scheduled/proactive snooze handling comes in Phase 4

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
- Auth: invitation key redemption + bearer token session middleware
  - Placeholder in place: reads `X-User-Id` header, returns 401 if missing
  - Next: `POST /auth/redeem`, real bearer token middleware, invitation/session repositories
- Response mapping: `toTaskResponse` strips internal fields (`userId`, `deletedAt`) from API responses ✅
- Global error handler: catches unhandled errors, returns JSON `{ error: "Internal server error" }` with 500 ✅
- Request logging: middleware logs `method path status duration` to stdout ✅
- Rate limiting: per-IP (unauthenticated) and per-user (authenticated)
- **Learning focus:** Node.js async patterns, middleware, request/response lifecycle

Completed endpoints:
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
  - `{ tokenHash: 1 }` unique on `invitations` — invitation key lookup
  - `{ tokenHash: 1 }` unique on `sessions` — bearer token lookup
- `ensureIndexes()` uses `createIndex` which is a no-op for identical definitions but errors if the name matches with a different definition. Changing an index shape requires dropping the old one first. Need a migration strategy for production (deferred).
- **End-to-end test needed:** duplicate email rejection (requires `ensureIndexes()` to have run)
- **Learning focus:** async I/O, MongoDB driver, document modeling, indexing

### Phase 4: Snooze/Timer Mechanics
- Proactive snooze handling (wake tasks when snooze expires)
- Handling server restarts
- **Learning focus:** Node.js event loop, scheduling, async patterns

### Future Possibilities
- Frontend (framework TBD, gesture/swipe driven for fast interaction)
- Websockets for real time updates
- Priority with a priority queue (with starvation prevention)
- Additional features as interest dictates

## Tooling
- **OS:** Windows with WSL (Ubuntu) for development
- **IDE:** VS Code with WSL extension
- **Node.js:** Installed inside WSL; Node 22 LTS via nvm
- **Package manager:** npm (comes with Node)
- **Version control:** Git (configured inside WSL)
- **Project location:** WSL filesystem (~/dev/task-manager), not /mnt/c/, for performance and file watching reliability

## Learning Approach
- Prioritize understanding over shipping
- Surface JavaScript fundamentals underneath TypeScript
- Discuss what TS compiles to at runtime
- Smaller projects may be interspersed as needed
