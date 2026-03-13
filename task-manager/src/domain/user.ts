import { v7 as uuidv7 } from 'uuid'

export type User = {
  id: string
  email: string
}

export function createUser(email: string): User {
  return {
    id: uuidv7(),
    email: email.trim().toLowerCase(),
  }
}
