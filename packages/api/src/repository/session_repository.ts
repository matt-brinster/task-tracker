import type { Collection } from 'mongodb'
import type { Session } from '../domain/session.js'

import { db } from './client.js'

type SessionDocument = {
  _id: string
  userId: string
  tokenHash: string
  createdAt: Date
  lastUsedAt: Date
}

function toDocument(session: Session): SessionDocument {
  return {
    _id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
  }
}

function fromDocument(doc: SessionDocument): Session {
  return {
    id: doc._id,
    userId: doc.userId,
    tokenHash: doc.tokenHash,
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
  }
}

function collection(): Collection<SessionDocument> {
  return db().collection<SessionDocument>('sessions')
}

export async function insertSession(session: Session): Promise<void> {
  await collection().insertOne(toDocument(session))
}

export async function findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
  const doc = await collection().findOne({ tokenHash })
  return doc ? fromDocument(doc) : null
}

export async function updateLastUsedAt(sessionId: string, now: Date): Promise<void> {
  await collection().updateOne({ _id: sessionId }, { $set: { lastUsedAt: now } })
}
