# ============================================
# FirmaVault SAT — Multi-stage Dockerfile
# ============================================

# Stage 1: Build frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production
WORKDIR /app

# Install Python, Chromium and required packages
RUN apk add --no-cache python3 py3-pip chromium chromium-chromedriver && \
    pip3 install --no-cache-dir defusedxml satcfdi selenium requests pandas openpyxl pdfminer.six xlsxwriter --break-system-packages

# Only install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy server and built frontend
COPY server ./server
COPY --from=builder /app/dist ./dist

# Copy Python tools (Nominas & Facturas)
COPY tools ./tools

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server/index.js"]
