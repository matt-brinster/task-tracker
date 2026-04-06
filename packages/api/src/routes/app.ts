import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { hashToken } from '../domain/crypto.js'
import { findSessionByTokenHash, updateLastUsedAt } from '../repository/session_repository.js'
import { authRouter } from './auth.js'
import { ipLimiter, userLimiter } from './rate-limit.js'
import { taskRouter } from './tasks.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webDist = path.resolve(__dirname, '../../../web/dist')

const app = express()

// Serve frontend static files (before API middleware)
app.use(express.static(webDist))

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
app.use('/auth', ipLimiter, authRouter)
app.use('/api/auth', ipLimiter, authRouter)

// Bearer token auth middleware (only for /tasks and /api/tasks)
const authenticate: express.RequestHandler = async (req, res, next) => {
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
}

app.use('/tasks', authenticate, userLimiter, taskRouter)
app.use('/api/tasks', authenticate, userLimiter, taskRouter)

// SPA fallback — serve index.html for non-API routes
app.get('/{*splat}', (_req, res, next) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next()
  })
})

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

export default app
