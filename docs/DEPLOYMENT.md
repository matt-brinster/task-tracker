# Deployment

This doc covers what's needed to run the app in production: required env vars, Atlas IP allowlist, and first-admin provisioning. Generic — no platform-specific instructions.

For local development, see the [README](../README.md).

## Required env vars

The production container reads its configuration from environment variables. Set these on the host (e.g. via your platform's secret/env UI):

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGO_URI` | yes | — | Atlas SRV string. **Must include a database name in the path** (e.g. `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/taskmanager?retryWrites=true&w=majority`). The Atlas Connect dialog omits it by default; add one. The app validates this at startup and refuses to start if it's missing — see [client.ts](../packages/api/src/repository/client.ts). |
| `PORT` | no | `3000` | The port the app listens on. Most platforms set this for you. |
| `TRUST_PROXY_HOPS` | no | `1` | Number of proxy hops in front of the app. Safe values: `0` (no proxy), `1` (single edge — typical), `2` (CDN-in-front-of-edge). **Never set to `true`** — `X-Forwarded-For` is client-settable, and `true` lets an attacker spoof IPs past the per-IP auth rate limiter. See [app.ts](../packages/api/src/routes/app.ts). |

Env vars set inside the [Dockerfile](../Dockerfile) and not intended for host override:

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables Express's production-mode behavior. |
| `WEB_DIST_DIR` | `/app/packages/web/dist` | Where the API serves the built SPA from. Set explicitly so the runtime contract is visible in the Dockerfile rather than implicit in a module-relative path. |

## Atlas IP allowlist

MongoDB Atlas requires an IP allowlist before any client can connect. The app's host needs its egress IPs allowlisted on the cluster's Network Access page.

- If your host advertises **static egress IPs**, add them as individual entries.
- If the host advertises a **CIDR range**, add the range.
- If the host advertises **shared egress IPs** (common on free tiers — e.g. Render free publishes two shared outbound IPs that all free-tier services route through), allowlist those individual IPs. Strictly better than `0.0.0.0/0`: the IP set is a small subset of the internet (other free-tier tenants of the same host, not arbitrary scanners). Caveat: free-tier egress IPs can rotate without notice, so a future mystery connection failure is worth checking the allowlist for first. Defense at the credential layer (DB user password + TLS) is unchanged either way — the IP allowlist is a network-layer narrowing, not a trust boundary.
- If the host has **no published egress IPs at all**, the practical options are: allow `0.0.0.0/0` (any IP can attempt a connection — defense then rests entirely on the Atlas database user's credentials and the cluster's TLS), or move to a tier that supports private networking (Atlas VPC peering / Private Endpoint). This hasn't been tested.

Whichever route, the cluster also needs a database user with read/write on the application database — that user's credentials go into the `MONGO_URI` above.

## First-admin provisioning

A fresh deploy has no users. The preferred path is to run the provision CLI **inside the running app container** (the production image already contains the compiled CLI at `packages/api/dist/admin/provision-cli.js`):

```bash
# Generic — replace with your platform's "exec into a running instance" command
<exec-into-container> node packages/api/dist/admin/provision-cli.js --email you@example.com --admin
```

The CLI prints an invitation key. Enter it on the login page to create a session. From there, additional users can be provisioned through the in-app admin UI (Settings → Create User).

The provision CLI also runs `ensureIndexes()`, which creates the required MongoDB indexes if they don't exist. Subsequent app startups run `ensureIndexes()` too, so no separate "migration" step is needed.

### Hosts without shell/SSH access

Some hosts (notably **Render free**) don't provide shell access to the running container, so the `<exec-into-container>` step above isn't available. Two stopgap options today:

1. **Run the provision CLI locally against the prod `MONGO_URI`.** Temporarily point a local `.env` at the production Atlas connection string and run `npx tsx --env-file=.env src/admin/provision-cli.ts --email you@example.com --admin` from `packages/api/`. Requires adding your dev IP to the Atlas allowlist for the duration, then removing it. Zero new code.
2. **Write the invitation document directly into Atlas** (data browser → `invitations` collection). Works but skips the domain factory and is awkward to repeat — fine for a one-off first-admin seed when you don't want to touch the allowlist.

A proper fix — an env-var-driven bootstrap that provisions an admin on startup when the DB is empty — is tracked under "Bootstrap admin (no-shell host)" in [TASK_MANAGER_PROJECT_PLAN.md](TASK_MANAGER_PROJECT_PLAN.md).

## Health check

The app exposes `GET /healthz` (unauthenticated, returns `{"status":"ok"}`) for liveness probes. It is registered before the request logger, so frequent health pings don't flood logs. It is **liveness only** — it does not ping MongoDB (a readiness check that pings the DB can flap the whole instance out of rotation on a transient blip).
