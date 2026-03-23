# Phase 6c TODOs

## Styling
- [x] Remove border dividers between task rows in list
- [x] Restyle section dividers (centered label with lines on each side)

## Shared components
- [x] Extract shared components: Checkbox, SectionDivider, Loading/Error states

## Behavior
- [x] Autosave with debounce when typing title/details
- [x] Delete button on new tasks (create then immediately delete)
- [ ] Handle invalid/expired token gracefully (currently 401 triggers reload loop if localStorage has a bad token)
- [ ] ~~Keep completed tasks visible until session ends~~ → replaced by archive feature (see below)

## Archive Feature

Completed tasks stay visible in the main list until the user explicitly archives them.
This eliminates the cache invalidation problem: completing a task no longer removes it
from the query, so there's no shadow state to maintain. Unarchive is a future concern
(reachable via full-text search).

### 1. Domain (`packages/api/`) — done

- [x] **Add `archivedAt: Date | null` to `Task` type** (`src/domain/task.ts`)
- [x] **Add `archiveTask` operation** (`src/domain/task_operations.ts`)
- [x] **Tests** (`src/domain/task_operations.test.ts`) — 39 tests, all existing "preserves all other fields" tests updated for `archivedAt`

### 2. Repository (`packages/api/`) — done

- [x] **Add `archivedAt` to `TaskDocument`** — `toDocument`/`fromDocument` updated, `fromDocument` uses `?? null` for backward compat
- [x] **Add `findActiveTasks`** — `{ userId, deletedAt: null, archivedAt: null }`, keeps `findOpenTasks` for now
- [x] **Add `archiveTasks(userId, taskIds, at)`** — bulk `$set` by ID array
- [x] **Add `archivedAt` compound index** — old `completedAt` index retained (cleanup deferred)
- **`searchTasks` — no changes now.** Future search has two use cases:
  - **Unarchive/revive:** find archived tasks to bring back
  - **Blocker lookup:** find tasks (including completed/archived) to add as blockers

### 3. API routes (`packages/api/`) — done

- [x] **`GET /tasks/active`** — returns unarchived, non-deleted tasks (completed or not)
- [x] **`POST /tasks/archive`** — accepts `{ taskIds: string[] }`, returns `{ archivedCount }`
- [x] **`archivedAt` added to `toTaskResponse`**
- [x] **Route tests** — 12 new tests for active + archive endpoints (199 total API tests)
- `GET /tasks/open` retained for now (cleanup deferred)

### 4. Frontend (`packages/web/`) — done

- [x] **`fetchActiveTasks` + `archiveTasks`** added to `api.ts`
- [x] **`archivedAt` added to `TaskResponse`** in `types.ts`
- [x] **`TaskListPage` rewritten** — uses `fetchActiveTasks`, no `justCompleted` shadow state, completion derived from `task.completedAt`, completed tasks stay in place (no separate section)
- [x] **"Archive completed tasks" button** in settings section, always visible, disabled when nothing to archive
- [x] **`TaskDetailPage`** — invalidation updated from `['tasks', 'open']` to `['tasks']` prefix
- [x] **Tests updated** — all 45 web tests passing

## Cleanup — remove pre-archive "open tasks" paths (revisit after blocker work is done)

- [ ] Delete `GET /tasks/open` route and its tests
- [ ] Delete `findOpenTasks` from `task_repository.ts`
- [ ] Drop `tasks_userId_deletedAt_completedAt` index (replaced by `archivedAt` variant)
- [ ] Update `searchTasks` filter if/when search use cases are addressed

## Polish
- [ ] Cream/manila background, more colors
- [ ] Fine-tune vertical spacing between task rows
- [ ] Animations between list and detail screens
- [ ] Shop for an icon library to replace inline SVGs
