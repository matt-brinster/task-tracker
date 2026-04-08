import { parseArgs } from 'node:util'

import { client } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { provision } from './provision.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    admin: { type: 'boolean', default: false },
  },
  strict: true,
})

if (!values.email) {
  console.error('Usage: npx tsx --env-file=.env src/admin/provision-cli.ts --email name@example.com [--admin]')
  process.exit(1)
}

try {
  await ensureIndexes()
  const result = await provision(values.email, values.admin)
  console.log(`User created:       ${result.userId}`)
  console.log(`Email:              ${result.email}`)
  console.log(`Invitation key:     ${result.rawToken}`)
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await client.close()
}
