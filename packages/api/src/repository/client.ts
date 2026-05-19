import { MongoClient } from 'mongodb'
import { databaseName } from './mongo-uri.js'

const uri = process.env['MONGO_URI']
if (!uri) {
  throw new Error('MONGO_URI must be set')
}

if (!databaseName(uri)) {
  throw new Error(
    'MONGO_URI must include a database name in the path, e.g. ' +
      'mongodb+srv://user:pass@cluster.mongodb.net/taskmanager. ' +
      'Atlas connection strings omit it by default — add one to the path.',
  )
}

export const client = new MongoClient(uri)

export function db() {
  return client.db()
}
