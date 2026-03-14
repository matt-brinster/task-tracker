# Stage 1: Install production dependencies only
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Install all dependencies and compile TypeScript
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npm run build

# Stage 3: Production image — just compiled JS and prod dependencies
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY --from=build /app/dist dist/
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
