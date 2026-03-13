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
npm run build      # compile TypeScript (outputs to dist/)
npm run clean      # remove dist/
npm test           # run tests (Vitest, watch mode); requires .env.test
npm test -- --run  # run tests once and exit
```

**Test framework: Vitest.** Tests load `.env.test` via `node --env-file=.env.test`. Copy `.env.test.example` to `.env.test` to get started. Integration tests require MongoDB running (`docker compose up -d`).

## Project Status

**Phase 1: Core Domain Modeling** — complete.
**Phase 3: Persistence** — complete.
**Phase 2: REST API Layer** — in progress.

Completed:
- `src/domain/task.ts` — `Task` type and `createTask` factory (uses UUIDv7 for IDs)
- `src/domain/task_operations.ts` — `completeTask`, `reopenTask`, `snoozeTask`, `wakeTask`, `deleteTask`, `addBlockers`, `removeBlockers`, `setQueue`
- `src/domain/task_operations.test.ts` — full test coverage for all operations above
- `src/domain/user.ts` — `User` type and `createUser` factory (UUIDv7 IDs, lowercases/trims email)
- `src/repository/client.ts` — MongoDB client and `db()` helper
- `src/repository/task_repository.ts` — `insertTask`, `updateTask(old, updated)`, `findTaskById(userId, taskId)`, `findOpenTasks(userId, limit?)`, `searchTasks(userId, query, limit?)`, document mapping (`toDocument`/`fromDocument`). Uses `task.id` as MongoDB `_id`. Queries filter out soft-deleted records by default. Text search also excludes completed tasks.
- `src/repository/user_repository.ts` — `insertUser`, `findUserById`, `findUserByEmail`
- `src/repository/indexes.ts` — `ensureIndexes()`: compound index on tasks (`userId`, `deletedAt`, `completedAt`), unique index on `users.email`, text index on tasks (`userId` prefix, `title` weight 2, `details` weight 1)
- `src/api/app.ts` — Express app setup: JSON body parsing, placeholder auth middleware (`X-User-Id` header), mounts task routes. Exports `app` without calling `.listen()` (for supertest).
- `src/api/tasks.ts` — `GET /tasks` route. Response mapped via `toTaskResponse` (excludes `userId`, `deletedAt`).
- `src/api/express.d.ts` — declaration merging to add `userId` to Express `Request`
- `src/api/tasks.test.ts` — supertest integration tests for `GET /tasks` (auth, empty list, response shape, user isolation)
- `src/index.ts` — entrypoint: runs `ensureIndexes()`, starts Express on `PORT` (default 3000)

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

Layered architecture:
- `src/domain/` — core types and pure functions (no I/O, no framework dependencies)
- `src/repository/` — persistence (Phase 3)
- `src/api/` — HTTP layer (Phase 2)

There is **no state machine** and no derived "status" field. The domain exposes raw data; the API and UI decide how to present it. Domain predicates may be added as needed (e.g. `isComplete`, `isSnoozed`), but status display logic belongs to the presentation layer.

**Soft deletes:** `deleteTask` sets `deletedAt` and scrubs `title`/`details` (PII removal). There is no restore. Deleted task documents remain for blocker reference integrity but are invisible to users.

**Blockers:** `blockers` is a `Blocker[]` — denormalized `{ id, title }` pairs stored as an array (not a set) to allow future priority ranking. Blocker titles are not automatically updated if the source task's title changes. Stale blocker cleanup is deferred.

Source lives in `src/`, compiled output goes to `dist/`. The TypeScript config uses `module: "nodenext"`, so imports require explicit `.js` extensions even for `.ts` source files (e.g. `import { foo } from './foo.js'`).

## TypeScript Configuration

Strict settings in use beyond `"strict": true`:
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` — optional props cannot be explicitly set to `undefined`
- `verbatimModuleSyntax` — type-only imports must use `import type`
- `isolatedModules` — each file must be independently compilable
