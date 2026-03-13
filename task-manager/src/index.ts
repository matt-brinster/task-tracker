import app from './api/app.js'
import { ensureIndexes } from './repository/indexes.js'

const port = process.env['PORT'] ?? 3000

await ensureIndexes()

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})
