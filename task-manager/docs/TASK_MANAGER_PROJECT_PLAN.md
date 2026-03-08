# Task Manager Project Plan

## Overview
A task manager application built with TypeScript and Node.js, designed as a learning vehicle for strengthening JavaScript and TypeScript skills.

## Task States
- **To Do** — default starting state
- **In Progress** — actively being worked on
- **Snoozed** — deferred with a timer/timestamp
- **Blocked** — waiting on something external
- **Done** — completed

## State Transitions
_To be designed in Phase 1. Key questions to resolve:_
- Can a Done task be reopened?
- Can a Blocked task go directly to Done?
- What triggers a Snoozed task to return, and to which state?

## Phases

### Phase 1: Core Domain Modeling (TypeScript)
- Define Task types and status types
- Model valid state transitions (state machine)
- Write pure functions for task creation and state transitions
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
- Frontend (framework TBD)
- Websockets for real time updates
- Additional features as interest dictates

## Tooling
- **OS:** Windows with WSL (Ubuntu) for development
- **IDE:** VS Code with WSL extension
- **Node.js:** To be installed inside WSL; target Node 22 LTS via nvm or fnm
- **Package manager:** npm (comes with Node)
- **Version control:** Git (to be configured inside WSL)
- **Note:** Project files should live on the WSL filesystem (e.g. ~/projects/), not on /mnt/c/, for performance and file watching reliability

## Learning Approach
- Prioritize understanding over shipping
- Surface JavaScript fundamentals underneath TypeScript
- Discuss what TS compiles to at runtime
- Hints and guidance before full solutions
- Smaller projects may be interspersed as needed