# ── Build stage ──────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy all source
COPY . .

# Build client (Vite) + server (esbuild → dist/index.cjs)
RUN npm run build

# ── Production stage ─────────────────────────────────────
FROM node:20-slim AS production

# better-sqlite3 needs build tools if prebuilt binaries aren't available
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production deps (includes better-sqlite3 native addon)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built artifacts from build stage
COPY --from=build /app/dist ./dist

# Railway injects PORT at runtime; default to 5000
ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
