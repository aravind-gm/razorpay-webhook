FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ──────────────────────
FROM node:20-alpine
WORKDIR /app

# Install Prisma CLI for migrations
RUN npm install -g @prisma/cli

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma schema for migrations (if using)
COPY prisma ./prisma/

EXPOSE 3001

CMD ["node", "dist/index.js"]
