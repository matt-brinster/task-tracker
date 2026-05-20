import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { hashToken } from '../domain/crypto.js'
import { findSessionByTokenHash, updateLastUsedAt } from '../repository/session_repository.js'
import { adminRouter } from './admin.js'
import { authRouter } from './auth.js'
import { ipLimiter, userLimiter } from './rate-limit.js'
import { taskRouter } from './tasks.js'
import { userRouter } from './users.js'

// Module-relative path to the built frontend. fileURLToPath(import.meta.url)
// — not import.meta.dirname — for Vitest/Vite portability.
const here = path.dirname(fileURLToPath(import.meta.url))
const webDistDir = process.env['WEB_DIST_DIR'] ?? path.join(here, '../../../web/dist')

const app = express()

// Trust N proxy hops so req.ip (and the per-IP auth rate limiter) reflect
// the real client. NEVER `true` — X-Forwarded-For is client-settable, and
// `true` lets an attacker spoof IPs past the limiter. Override via
// TRUST_PROXY_HOPS. Safe values: 0 (no proxy), 1 (single edge — default),
// 2 (CDN-in-front-of-edge).
app.set('trust proxy', Number(process.env['TRUST_PROXY_HOPS'] ?? 1))

// Liveness probe. Before the request logger so health pings don't flood logs.
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use(express.json())

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// All API routes under /api so dev (Vite proxy) and prod (single origin) share identical paths.
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

// Serve the built SPA. No history fallback — this app has no client routing.
app.use(express.static(webDistDir))

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

export default app
