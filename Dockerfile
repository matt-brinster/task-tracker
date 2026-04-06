# Stage 1: Install production dependencies only
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci --omit=dev

# Stage 2: Install all dependencies and compile API + Web
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/
COPY packages/web/package.json packages/web/tsconfig.json packages/web/tsconfig.app.json packages/web/tsconfig.node.json ./packages/web/
RUN npm ci
COPY packages/api/src/ ./packages/api/src/
COPY packages/web/index.html packages/web/vite.config.ts ./packages/web/
COPY packages/web/src/ ./packages/web/src/
RUN npm run build -w api && npm run build -w web

# Stage 3: Production image — compiled JS, frontend bundle, prod dependencies
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules/
COPY --from=build /app/packages/api/dist ./packages/api/dist/
COPY --from=build /app/packages/web/dist ./packages/web/dist/
COPY package.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
