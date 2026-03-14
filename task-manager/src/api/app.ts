import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { hashToken } from '../domain/crypto.js'
import { findSessionByTokenHash, updateLastUsedAt } from '../repository/session_repository.js'
import { authRouter } from './auth.js'
import { taskRouter } from './tasks.js'

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

// Auth routes are unauthenticated (you need them to get a token)
app.use('/auth', authRouter)

// Bearer token auth middleware
app.use(async (req, res, next) => {
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

app.use('/tasks', taskRouter)

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

export default app
