import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { completeTask, reopenTask } from '../api.ts'

/** Invalidate both the task list and all individual task caches. */
export function invalidateTaskQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['tasks'] })
  queryClient.invalidateQueries({ queryKey: ['task'] })
}

export function useTaskMutations() {
  const queryClient = useQueryClient()

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => { invalidateTaskQueries(queryClient) },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenTask,
    onSuccess: () => { invalidateTaskQueries(queryClient) },
  })

  return { completeMutation, reopenMutation }
}
