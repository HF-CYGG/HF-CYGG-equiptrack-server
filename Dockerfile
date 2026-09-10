# Build stage
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci

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

# Copy app_version.json
COPY app_version.json ./

# Create data directory for persistence
RUN mkdir -p data

# 以非 root 运行：容器内的写入会通过 bind mount 落到宿主机目录，
# 用 root 会让任何一次越权写入直接拿到宿主机 root 权限
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
