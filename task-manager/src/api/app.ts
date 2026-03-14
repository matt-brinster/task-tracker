import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { taskRouter } from './tasks.js'

const app = express()

app.use(express.json())

// Placeholder auth: reads X-User-Id header.
// Replace with real auth middleware (bearer token → session lookup) later.
app.use((req, res, next) => {
  const userId = req.headers['x-user-id']
  if (typeof userId !== 'string' || userId === '') {
    res.status(401).json({ error: 'Missing X-User-Id header' })
    return
  }
  req.userId = userId
  next()
})

app.use('/tasks', taskRouter)

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

export default app
