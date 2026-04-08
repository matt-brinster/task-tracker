import { Router } from 'express'
import { findUserById } from '../repository/user_repository.js'
import { provision } from '../admin/provision.js'

export const adminRouter = Router()

// Admin-only middleware: all /admin routes require isAdmin
adminRouter.use(async (req, res, next) => {
  const user = await findUserById(req.userId)
  if (!user?.isAdmin) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
})

adminRouter.post('/users', async (req, res) => {
  const { email } = req.body as { email?: string }
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'email is required' })
    return
  }
  try {
    const result = await provision(email)
    res.status(201).json({ userId: result.userId, email: result.email, invitationKey: result.rawToken })
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      res.status(409).json({ error: err.message })
      return
    }
    throw err
  }
})
