import { createSession } from '../domain/session.js'
import { insertSession } from '../repository/session_repository.js'

/**
 * Creates a session in the DB for the given userId and returns
 * the raw bearer token for use in test requests.
 */
export async function createTestSession(userId: string): Promise<string> {
  const { session, rawToken } = createSession(userId)
  await insertSession(session)
  return rawToken
}
