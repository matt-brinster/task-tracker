# Task Manager Project Plan

## Overview
A task manager application built with TypeScript and Node.js. Supports a small number of users (family). Design priorities are speed of use and low ceremony.

Also serves as a learning vehicle for strengthening JavaScript and TypeScript skills.

## Data Model

### User
A user has:
- **id:** GUID
- **emails:** strings

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

Passwordless magic link flow:
1. Admin adds user's email to the `users` table directly
2. User visits app on a new device, enters their email
3. App checks email exists in `users`, sends a magic link
4. User clicks link — token is consumed, a long-lived session token is issued for that device
5. Device stores the session token and sends it as a bearer token on all subsequent requests

### DB Tables (auth)
- **`users`**: `id`, `email`
- **`pending_verifications`**: `id`, `email`, `token`, `expires_at` — consumed on use
- **`sessions`**: `id`, `user_id`, `token_hash`, `created_at`, `last_used_at` — one row per verified device

## Storage

### Database
**MongoDB.** Good fit for the document shape of tasks, natural for embedded arrays (`blockerIds`, `sessions`), and a learning goal in its own right.

### Collections
- **`tasks`**: one document per task, `blockerIds` stored as an array field
- **`users`**: one document per user, `sessions` embedded as an array
- **`pending_verifications`**: magic link tokens, with a TTL index on `expiresAt` for automatic expiry

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

### Phase 2: REST API Layer
- HTTP framework (Express or Fastify, TBD)
- Routing, validation, error handling
- Auth middleware (bearer token → session lookup → userId on request)
- Request logging
- Rate limiting: per-IP (unauthenticated) and per-user (authenticated)
- **Learning focus:** Node.js async patterns, middleware, request/response lifecycle

### Phase 3: Persistence
- MongoDB integration
- Repository layer implementing the DB gateway interface
- Indexes — add alongside queries as access patterns solidify. Likely candidates:
  - `{ userId: 1, completedAt: 1 }` — primary query: user's incomplete tasks
  - `{ userId: 1, snoozedUntil: 1 }` — snoozed task queries
  - `{ title: "text", details: "text" }` — full-text search (one text index per collection; weight title higher)
  - TTL index on `pending_verifications.expiresAt` — automatic magic link cleanup
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
