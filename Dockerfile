# Stage 1: Install production dependencies only
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
RUN npm ci --omit=dev

# Stage 2: Build the API (compile TypeScript)
FROM node:22-slim AS build-api
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/
RUN npm ci -w api
COPY packages/api/src/ ./packages/api/src/
RUN npm run build -w api

# Stage 3: Build the frontend SPA (tsc + vite)
FROM node:22-slim AS build-web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci -w web
COPY packages/web/ ./packages/web/
RUN npm run build -w web

# Stage 4: Production image — compiled API, built SPA, prod dependencies
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules/
COPY --from=build-api /app/packages/api/dist ./packages/api/dist/
COPY --from=build-web /app/packages/web/dist ./packages/web/dist/
COPY package.json ./
COPY packages/api/package.json ./packages/api/
ENV WEB_DIST_DIR=/app/packages/web/dist
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
