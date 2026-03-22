# Phase 6c TODOs

## Styling
- [ ] Cream/manila background, more colors, fewer borders/line breaks
- [ ] Restyle section dividers (centered label with lines on each side)

## Shared components
- [ ] Extract shared components: Checkbox, SectionDivider, Loading/Error states

## Behavior
- [ ] Autosave with debounce when typing title/details
- [ ] Delete button on new tasks (create then immediately delete)
- [ ] ~~Keep completed tasks visible until session ends~~ → replaced by archive feature (see below)

## Archive Feature

Completed tasks stay visible in the main list until the user explicitly archives them.
This eliminates the cache invalidation problem: completing a task no longer removes it
from the query, so there's no shadow state to maintain. Unarchive is a future concern
(reachable via full-text search).

### 1. Domain (`packages/api/`)

- [ ] **Add `archivedAt: Date | null` to `Task` type** (`src/domain/task.ts`)
  - Initialize to `null` in `createTask()`

- [ ] **Add `archiveTask` operation** (`src/domain/task_operations.ts`)
  - `archiveTask(task: Task, at: Date): Task` — sets `archivedAt`
  - No `unarchiveTask` for now

- [ ] **Tests** (`src/domain/task_operations.test.ts`)
  - `archiveTask` sets `archivedAt`, leaves other fields untouched

### 2. Repository (`packages/api/`)

- [ ] **Add `archivedAt` to `TaskDocument`** (`src/repository/task_repository.ts`)
  - Update `toDocument()` and `fromDocument()` mapping

- [ ] **Rename `findOpenTasks` → `findActiveTasks`** (`src/repository/task_repository.ts`)
  - New filter: `{ userId, deletedAt: null, archivedAt: null }` (drop `completedAt: null`)
  - This is the key change: completed-but-unarchived tasks now appear in results

- [ ] **Add `archiveTasks(userId: string, taskIds: string[], at: Date)`** (`src/repository/task_repository.ts`)
  - Bulk update: set `archivedAt` on all docs matching `{ _id: { $in: taskIds }, userId, deletedAt: null, archivedAt: null }`
  - No server-side check for `completedAt` — caller decides which tasks to archive
  - Return count of archived tasks

- **`searchTasks` — no changes now.** Current filter (`deletedAt: null, completedAt: null`) stays.
  Future search work has two distinct use cases:
  - **Unarchive/revive:** find archived tasks to bring back into the active list
  - **Blocker lookup:** find tasks (including completed/archived) to add as blockers

- [ ] **Update compound index** (`src/repository/indexes.ts`)
  - Change `{ userId: 1, deletedAt: 1, completedAt: 1 }` → `{ userId: 1, deletedAt: 1, archivedAt: 1 }`
  - `completedAt` no longer drives query filtering, `archivedAt` does

### 3. API routes (`packages/api/`)

- [ ] **Add `GET /tasks/active`** (`src/routes/tasks.ts`)
  - Calls `findActiveTasks` — returns unarchived, non-deleted tasks (completed or not)
- [ ] **Delete `GET /tasks/open`** (`src/routes/tasks.ts`)
  - Remove after frontend is switched over to `/tasks/active`

- [ ] **Add `POST /tasks/archive`** (`src/routes/tasks.ts`)
  - Accepts `{ taskIds: string[] }`
  - Calls `archiveTasks(req.userId, taskIds, new Date())`
  - Returns `{ archivedCount: number }`

- [ ] **Add `archivedAt` to `toTaskResponse`** (`src/routes/tasks.ts`)
  - Not strictly needed now (archived tasks aren't returned), but keeps the API honest

- [ ] **Update route tests** (`src/routes/tasks.test.ts`)
  - Rename open-tasks tests to active-tasks
  - Test that completed tasks appear in active list
  - Test archive-completed endpoint (archives only completed, returns count)
  - Test that archived tasks no longer appear in active list or search

### 4. Frontend (`packages/web/`)

- [ ] **Update API functions** (`src/api.ts`)
  - Rename `fetchOpenTasks` → `fetchActiveTasks`, point at `/tasks/active`
  - Add `archiveTasks(taskIds: string[]): Promise<{ archivedCount: number }>`

- [ ] **Update `TaskResponse` type** (`src/types.ts`)
  - Add `archivedAt: string | null`

- [ ] **Rewrite `TaskListPage`** (`src/pages/TaskListPage.tsx`)
  - Drop `justCompleted` state entirely
  - Query key changes from `['tasks', 'open']` to `['tasks', 'active']`
  - Determine completed status from `task.completedAt !== null` (server truth)
  - Checkbox calls `completeTask`/`reopenTask` as before, but no shadow set needed
  - Split list rendering: actionable tasks on top, completed tasks below (with strikethrough or muted style)

- [ ] **Add "Archive completed" button** (`src/pages/TaskListPage.tsx`)
  - Place in the Settings section for now (near logout)
  - Only visible when completed tasks exist in the list
  - Collects IDs of completed tasks from the current list, calls `archiveTasks(ids)`
  - Invalidates `['tasks', 'active']` query on success

- [ ] **Update tests** (`src/pages/TaskListPage.test.tsx`, `src/api.test.ts`)
  - Test completed tasks render in the list with checked state
  - Test archive button appears/disappears based on completed tasks
  - Test archive mutation invalidates the task list query

## Cleanup — remove pre-archive "open tasks" paths (revisit after blocker work is done)

- [ ] Delete `GET /tasks/open` route and its tests
- [ ] Delete `findOpenTasks` from `task_repository.ts`
- [ ] Drop `tasks_userId_deletedAt_completedAt` index (replaced by `archivedAt` variant)
- [ ] Update `searchTasks` filter if/when search use cases are addressed

## Polish
- [ ] Animations between list and detail screens
- [ ] Shop for an icon library to replace inline SVGs
