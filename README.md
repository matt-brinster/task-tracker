# Task Tracker

A task manager for family use. Monorepo with an Express API backend and a React SPA frontend.

## Prerequisites

- Node.js 22+
- Docker and Docker Compose (for MongoDB)

## Setup

```bash
npm install
cp packages/api/.env.example packages/api/.env
cp packages/api/.env.test.example packages/api/.env.test
```

## Running

Start MongoDB:

```bash
docker compose up -d mongodb
```

Start the API (port 3000):

```bash
npm run build -w api
node packages/api/dist/index.js
```

Or run the API and MongoDB in Docker:

```bash
docker compose up --build
```

Start the frontend dev server (port 5173, proxies `/api` to the backend):

```bash
npm run dev -w web
```

## Testing

```bash
# API integration tests (requires MongoDB running)
npm test -w api -- --run

# Frontend unit tests
npm test -w web -- --run
```

Drop the `-- --run` to start in watch mode.

## Provisioning a user

```bash
cd packages/api
npx tsx --env-file=.env src/admin/provision-cli.ts --email name@example.com
```

This creates a user and prints an invitation key. Enter the key on the login page to create a session.

## Stopping

```bash
docker compose down
```
