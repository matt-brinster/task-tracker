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

No test framework is configured yet — the `test` script is a placeholder. When one is added, this file should be updated.

## Project Status

Currently in **Phase 1: Core Domain Modeling**. The codebase is at the very start — `src/index.ts` is a placeholder. The immediate work is defining the task domain types and state machine.

See `docs/TASK_MANAGER_PROJECT_PLAN.md` for the full roadmap.

## Architecture

The domain centers on a **task state machine** with five states:

- `todo` → `in_progress` → `done`
- Any non-done state → `snoozed` (deferred with a timestamp) or `blocked`
- State transition rules are still being designed (see the plan doc for open questions)

Source lives in `src/`, compiled output goes to `dist/`. The TypeScript config uses `module: "nodenext"`, so imports require explicit `.js` extensions even for `.ts` source files (e.g. `import { foo } from './foo.js'`).

## TypeScript Configuration

Strict settings in use beyond `"strict": true`:
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` — optional props cannot be explicitly set to `undefined`
- `verbatimModuleSyntax` — type-only imports must use `import type`
- `isolatedModules` — each file must be independently compilable
