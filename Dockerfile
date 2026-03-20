# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production server ──────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy the built React app into the backend's expected location
COPY --from=frontend-build /app/frontend/build ./frontend/build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "backend/server.js"]
