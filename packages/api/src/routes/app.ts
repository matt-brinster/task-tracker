import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { hashToken } from '../domain/crypto.js'
import { findSessionByTokenHash, updateLastUsedAt } from '../repository/session_repository.js'
import { adminRouter } from './admin.js'
import { authRouter } from './auth.js'
import { ipLimiter, userLimiter } from './rate-limit.js'
import { taskRouter } from './tasks.js'
import { userRouter } from './users.js'

const app = express()

app.use(express.json())

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// All API routes live under /api so the prod container (Express serving both
// the SPA and the API on one origin) and dev (Vite proxy, no rewrite) share
// identical paths. The browser always calls /api/*.
const api = express.Router()

// Auth routes are unauthenticated (you need them to get a token)
api.use('/auth', ipLimiter, authRouter)

// Bearer token auth middleware
api.use(async (req, res, next) => {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const rawToken = header.slice(7)
  const tokenHash = hashToken(rawToken)
  const session = await findSessionByTokenHash(tokenHash)

  if (!session) {
    res.status(401).json({ error: 'Invalid session token' })
    return
  }

  req.userId = session.userId
  updateLastUsedAt(session.id, new Date())
  next()
})

api.use('/tasks', userLimiter, taskRouter)
api.use('/users', userLimiter, userRouter)
api.use('/admin', userLimiter, adminRouter)

app.use('/api', api)

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

export default app
