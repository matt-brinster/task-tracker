import { Router } from 'express'
import { hashToken } from '../domain/crypto.js'
import { createSession } from '../domain/session.js'
import { findInvitationByTokenHash, incrementSessionCount } from '../repository/invitation_repository.js'
import { insertSession } from '../repository/session_repository.js'

const MAX_SESSIONS_PER_INVITATION = 10

export const authRouter = Router()

authRouter.post('/redeem', async (req, res) => {
  const { key } = req.body

  if (typeof key !== 'string' || key === '') {
    res.status(400).json({ error: 'Missing key' })
    return
  }

  const tokenHash = hashToken(key)
  const invitation = await findInvitationByTokenHash(tokenHash)

  if (!invitation) {
    res.status(401).json({ error: 'Invalid invitation key' })
    return
  }

  if (invitation.sessionCount >= MAX_SESSIONS_PER_INVITATION) {
    res.status(403).json({ error: 'Invitation key has reached its session limit' })
    return
  }

  const { session, rawToken } = createSession(invitation.userId)
  await insertSession(session)
  await incrementSessionCount(invitation.id)

  res.status(201).json({ token: rawToken })
})
