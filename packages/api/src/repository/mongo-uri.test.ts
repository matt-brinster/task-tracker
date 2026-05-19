import { describe, it, expect } from 'vitest'
import { databaseName } from './mongo-uri.js'

describe('databaseName', () => {
  it('reads the db from a standard URI with credentials and options', () => {
    expect(
      databaseName(
        'mongodb://admin:devpassword@localhost:27017/taskmanager?authSource=admin',
      ),
    ).toBe('taskmanager')
  })

  it('reads the db when there are no options', () => {
    expect(databaseName('mongodb://localhost:27017/taskmanager')).toBe('taskmanager')
  })

  it('reads the db from a +srv seed list with options', () => {
    expect(
      databaseName(
        'mongodb+srv://user:pass@cluster.abcde.mongodb.net/taskmanager_dev?retryWrites=true&w=majority',
      ),
    ).toBe('taskmanager_dev')
  })

  it('returns undefined for the Atlas Connect-dialog default (trailing slash, options, no db)', () => {
    expect(
      databaseName(
        'mongodb+srv://user:pass@cluster.abcde.mongodb.net/?retryWrites=true&w=majority',
      ),
    ).toBeUndefined()
  })

  it('returns undefined when there is no path at all', () => {
    expect(databaseName('mongodb://localhost:27017')).toBeUndefined()
  })

  it('is not fooled by a percent-encoded slash in the password', () => {
    // "/" inside credentials must be percent-encoded per the connection-string
    // spec, so the first *raw* "/" still marks the end of the host list.
    expect(
      databaseName('mongodb://user:pa%2Fss@localhost:27017/taskmanager'),
    ).toBe('taskmanager')
  })
})
