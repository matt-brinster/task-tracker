import { Router } from 'express'
import { findUserById } from '../repository/user_repository.js'

export const userRouter = Router()

userRouter.get('/me', async (req, res) => {
  const user = await findUserById(req.userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ id: user.id, email: user.email, isAdmin: user.isAdmin })
})
