import { MongoClient } from 'mongodb'

const username = process.env['MONGO_USERNAME']
const password = process.env['MONGO_PASSWORD']
const host     = process.env['MONGO_HOST'] ?? 'localhost'
const port     = process.env['MONGO_PORT'] ?? '27017'
const database = process.env['MONGO_DATABASE']

if (!username || !password || !database) {
  throw new Error('MONGO_USERNAME, MONGO_PASSWORD, and MONGO_DATABASE must be set')
}

const uri = `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`

export const client = new MongoClient(uri)

export function db() {
  return client.db(database)
}
