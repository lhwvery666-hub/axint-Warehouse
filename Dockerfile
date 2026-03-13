# ══════════════════════════════════════════════════════════════════════════════
# axiom-repair  生产环境 Dockerfile
#
# 打包原理（三阶段构建）：
#
#   Stage 1 [deps]     只安装 node_modules，利用 Docker 缓存层加速后续构建
#   Stage 2 [builder]  执行 next build，产出 .next/standalone 最小运行目录
#   Stage 3 [runner]   只复制运行所需的文件，最终镜像不含源码和开发依赖
#
# 最终镜像体积约 200-400MB（相比直接打包 node_modules 的 1-2GB 大幅缩小）
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: 安装依赖 ─────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# 安装 libc 兼容层（某些 npm 包需要）
RUN apk add --no-cache libc6-compat

WORKDIR /app

# 先只复制 package.json，利用缓存层：依赖没变就不重新 install
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# 优先用 pnpm（项目有 pnpm-lock.yaml），否则 npm
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
    npm ci; \
  fi

# Prisma 需要在 node_modules 安装后生成客户端
COPY prisma ./prisma
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    pnpm run prisma:generate; \
  else \
    npm run prisma:generate; \
  fi


# ── Stage 2: 构建 Next.js ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 把依赖从上一层复制过来
COPY --from=deps /app/node_modules ./node_modules

# 复制全部源代码
COPY . .

# 构建时传入空的占位环境变量，让 Next.js 能顺利 build
# 真实值在运行容器时通过 -e 或 docker-compose 注入
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DB_SERVER=placeholder
ENV DB_DATABASE=placeholder
ENV DB_USER=placeholder
ENV DB_PASSWORD=placeholder
ENV DATABASE_URL="sqlserver://placeholder:1433;database=placeholder;user=placeholder;password=placeholder;trustServerCertificate=true"

RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm run build; \
  else \
    npm run build; \
  fi


# ── Stage 3: 最终运行镜像 ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# 复制 standalone 打包结果（已包含必要的 node_modules 子集）
COPY --from=builder /app/.next/standalone ./

# 复制静态资源（CSS / JS / 图片等，standalone 模式不自动包含）
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 public 目录（图标、静态图片、已上传的文件等）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 创建上传目录并赋权（本地存储模式使用）
RUN mkdir -p ./public/uploads && chown -R nextjs:nodejs ./public/uploads

USER nextjs

# 暴露端口（默认 3000，可通过 PORT 环境变量覆盖）
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# standalone 模式的启动入口是 server.js（不再是 next start）
CMD ["node", "server.js"]
