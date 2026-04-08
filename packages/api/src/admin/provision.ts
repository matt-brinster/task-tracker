import { createUser } from '../domain/user.js'
import { createInvitation } from '../domain/invitation.js'
import { insertUser, findUserByEmail } from '../repository/user_repository.js'
import { insertInvitation } from '../repository/invitation_repository.js'

export type ProvisionResult = {
  userId: string
  email: string
  rawToken: string
}

export async function provision(email: string, isAdmin = false): Promise<ProvisionResult> {
  const existing = await findUserByEmail(email.trim().toLowerCase())
  if (existing) {
    throw new Error(`User with email "${email}" already exists (id: ${existing.id})`)
  }

  const user = createUser(email, isAdmin)
  await insertUser(user)

  const { invitation, rawToken } = createInvitation(user.id)
  await insertInvitation(invitation)

  return { userId: user.id, email: user.email, rawToken }
}
