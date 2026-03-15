import type { Collection } from 'mongodb'
import type { User } from '../domain/user.js'

import { db } from './client.js'

type UserDocument = {
  _id: string
  email: string
}

function toDocument(user: User): UserDocument {
  return {
    _id: user.id,
    email: user.email,
  }
}

function fromDocument(doc: UserDocument): User {
  return {
    id: doc._id,
    email: doc.email,
  }
}

function collection(): Collection<UserDocument> {
  return db().collection<UserDocument>('users')
}

export async function insertUser(user: User): Promise<void> {
  await collection().insertOne(toDocument(user))
}

export async function findUserById(userId: string): Promise<User | null> {
  const doc = await collection().findOne({ _id: userId })
  return doc ? fromDocument(doc) : null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const doc = await collection().findOne({ email })
  return doc ? fromDocument(doc) : null
}
