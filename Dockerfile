# Stage 1: Install production dependencies only
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
RUN npm ci --omit=dev

# Stage 2: Install all dependencies and compile TypeScript
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/
RUN npm ci
COPY packages/api/src/ ./packages/api/src/
RUN npm run build -w api

# Stage 3: Production image — just compiled JS and prod dependencies
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules/
COPY --from=build /app/packages/api/dist ./packages/api/dist/
COPY package.json ./
COPY packages/api/package.json ./packages/api/
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
