// Extracts the default database name from a MongoDB connection string — the
// path segment between the first "/" after the host list and the "?" options.
// Works for both mongodb:// and mongodb+srv:// seed lists: the connection-string
// spec requires reserved characters (including "/") in the userinfo to be
// percent-encoded, so the first raw "/" always marks the end of the host list.
export function databaseName(connectionString: string): string | undefined {
  const afterScheme = connectionString.replace(/^mongodb(\+srv)?:\/\//, '')
  const hostsEnd = afterScheme.indexOf('/')
  if (hostsEnd === -1) return undefined
  const afterHosts = afterScheme.slice(hostsEnd + 1)
  const queryStart = afterHosts.indexOf('?')
  const path = queryStart === -1 ? afterHosts : afterHosts.slice(0, queryStart)
  return path.length > 0 ? path : undefined
}
