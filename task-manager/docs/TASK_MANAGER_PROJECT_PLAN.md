# Task Manager Project Plan

## Overview
A **personal** task manager application built with TypeScript and Node.js. This is a tool for one person to manage their own tasks quickly, not a team collaboration or project management tool. Design priorities are speed of use and low ceremony.

Also serves as a learning vehicle for strengthening JavaScript and TypeScript skills.

## Data Model

### Task
A task has:
- **Queue:** Todo or Backlog. Todo is the default. Backlog is a low priority "someday maybe" bucket.
- **completedAt:** Nullable timestamp. Set means done.
- **snoozedUntil:** Nullable timestamp. Set and in the future means snoozed.
- **Blockers:** A collection of other tasks that must be completed first. A task is blocked if and only if it has incomplete blockers.

### Derived Display Status
The status a user sees is computed from data, not stored explicitly. Precedence order:

1. Has `completedAt`? → **Done**
2. Has incomplete blockers? → **Blocked**
3. Has `snoozedUntil` in the future? → **Snoozed**
4. Otherwise → the task's **queue** (Todo or Backlog)

### Operations
There is no state machine. "Transitions" are data operations:
- **Complete:** Set `completedAt`
- **Uncomplete (undo):** Clear `completedAt`. The task returns to whatever its underlying situation is (queue, blockers, snooze).
- **Snooze:** Set `snoozedUntil`
- **Unsnooze:** Clear `snoozedUntil` (or let it expire)
- **Block:** Add a blocker relationship to another task
- **Unblock:** Automatically resolved when the blocking task is completed
- **Promote/Demote:** Move between Todo and Backlog queues

### Edge Cases
- A task that is both snoozed and blocked displays as Blocked (harder constraint wins)
- A task that is completed ignores blockers and snooze for display purposes
- Cycle detection for blocker chains is deferred

### Snooze Behavior
- Short term: expired snoozes are resolved lazily on task lookup
- Scheduled/proactive snooze handling comes in Phase 4

## Phases

### Phase 1: Core Domain Modeling (TypeScript)
- Define Task types using union literal types
- Implement derived status computation
- Write pure functions for task operations (complete, snooze, block, queue changes)
- Blocker relationships
- Type system enforcement where possible, runtime checks where necessary
- Full test coverage
- **Learning focus:** TypeScript fundamentals, type system, JS runtime behavior, testing

### Phase 2: REST API Layer
- HTTP framework (Express or Fastify, TBD)
- Routing, validation, error handling
- **Learning focus:** Node.js async patterns, middleware, request/response lifecycle

### Phase 3: Persistence
- Database integration (TBD)
- ORM or query builder (TBD)
- **Learning focus:** async I/O, connection management, migrations

### Phase 4: Snooze/Timer Mechanics
- Time based state transitions
- Handling server restarts (persistence of scheduled events)
- **Learning focus:** Node.js event loop, scheduling, async patterns

### Future Possibilities
- Authentication
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
- Hints and guidance before full solutions
- Smaller projects may be interspersed as needed