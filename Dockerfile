# Build stage
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --only=production

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file example
COPY .env.example ./.env

# Create data directory for persistence
RUN mkdir -p data

EXPOSE 3000

CMD ["npm", "start"]
