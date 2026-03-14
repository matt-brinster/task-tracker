import type { Collection } from 'mongodb'
import type { Invitation } from '../domain/invitation.js'

import { db } from './client.js'

type InvitationDocument = {
  _id: string
  userId: string
  tokenHash: string
  createdAt: Date
  sessionCount: number
}

function toDocument(invitation: Invitation): InvitationDocument {
  return {
    _id: invitation.id,
    userId: invitation.userId,
    tokenHash: invitation.tokenHash,
    createdAt: invitation.createdAt,
    sessionCount: invitation.sessionCount,
  }
}

function fromDocument(doc: InvitationDocument): Invitation {
  return {
    id: doc._id,
    userId: doc.userId,
    tokenHash: doc.tokenHash,
    createdAt: doc.createdAt,
    sessionCount: doc.sessionCount,
  }
}

function collection(): Collection<InvitationDocument> {
  return db().collection<InvitationDocument>('invitations')
}

export async function insertInvitation(invitation: Invitation): Promise<void> {
  await collection().insertOne(toDocument(invitation))
}

export async function findInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
  const doc = await collection().findOne({ tokenHash })
  return doc ? fromDocument(doc) : null
}

export async function incrementSessionCount(invitationId: string): Promise<void> {
  await collection().updateOne({ _id: invitationId }, { $inc: { sessionCount: 1 } })
}
