import { useMutation, useQueryClient } from '@tanstack/react-query'
import { completeTask, reopenTask } from '../api.ts'

export function useTaskMutations() {
  const queryClient = useQueryClient()

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return { completeMutation, reopenMutation }
}
