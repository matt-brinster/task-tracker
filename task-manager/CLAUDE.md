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
```

**Test framework: Vitest** (installed).

## Project Status

**Phase 1: Core Domain Modeling** — in progress.

Completed:
- `src/domain/task.ts` — `Task` type and `createTask` factory
- `src/domain/task_operations.ts` — `completeTask`, `reopenTask`, `snoozeTask`, `wakeTask`, `addBlockerIds`, `removeBlockerIds`
- `src/domain/task_operations.test.ts` — full test coverage for all operations above
- `src/domain/user.ts` — `User` type (id, email; no operations)

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

Layered architecture:
- `src/domain/` — core types and pure functions (no I/O, no framework dependencies)
- `src/repository/` — persistence (Phase 3)
- `src/api/` — HTTP layer (Phase 2)

There is **no state machine** and no derived "status" field. The domain exposes raw data; the API and UI decide how to present it. Domain predicates may be added as needed (e.g. `isComplete`, `isSnoozed`), but status display logic belongs to the presentation layer.

**Blockers:** `blockerIds` is a set of task IDs. It is not automatically cleaned up when a blocking task completes. Stale blocker ID cleanup is deferred.

Source lives in `src/`, compiled output goes to `dist/`. The TypeScript config uses `module: "nodenext"`, so imports require explicit `.js` extensions even for `.ts` source files (e.g. `import { foo } from './foo.js'`).

## TypeScript Configuration

Strict settings in use beyond `"strict": true`:
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` — optional props cannot be explicitly set to `undefined`
- `verbatimModuleSyntax` — type-only imports must use `import type`
- `isolatedModules` — each file must be independently compilable
