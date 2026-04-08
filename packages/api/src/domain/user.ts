import { v7 as uuidv7 } from 'uuid'

export type User = {
  id: string
  email: string
  isAdmin: boolean
}

export function createUser(email: string, isAdmin = false): User {
  return {
    id: uuidv7(),
    email: email.trim().toLowerCase(),
    isAdmin,
  }
}
