import { v7 as uuidv7 } from 'uuid'
import { generateToken, hashToken } from './crypto.js'

export type Invitation = {
  id: string
  userId: string
  tokenHash: string
  createdAt: Date
  sessionCount: number
}

export function createInvitation(userId: string): { invitation: Invitation; rawToken: string } {
  const rawToken = generateToken()
  const invitation: Invitation = {
    id: uuidv7(),
    userId,
    tokenHash: hashToken(rawToken),
    createdAt: new Date(),
    sessionCount: 0,
  }
  return { invitation, rawToken }
}
