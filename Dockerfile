FROM node:22-slim AS builder

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install application dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Create data directory for SQLite and uploads
RUN mkdir -p /app/data /app/data/match-evidence

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]

