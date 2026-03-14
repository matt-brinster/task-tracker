import { v7 as uuidv7 } from 'uuid'
import { generateToken, hashToken } from './crypto.js'

export type Session = {
  id: string
  userId: string
  tokenHash: string
  createdAt: Date
  lastUsedAt: Date
}

export function createSession(userId: string): { session: Session; rawToken: string } {
  const rawToken = generateToken()
  const now = new Date()
  const session: Session = {
    id: uuidv7(),
    userId,
    tokenHash: hashToken(rawToken),
    createdAt: now,
    lastUsedAt: now,
  }
  return { session, rawToken }
}
