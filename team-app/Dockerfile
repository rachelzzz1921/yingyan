# syntax=docker/dockerfile:1.7
# 鹰眼 · ARM64 离线交付镜像（Node.js 稽核工作台）
# 构建（仓库根目录）：docker build -f team-app/Dockerfile -t team-app:arm64 .

ARG IMAGE_PLATFORM=linux/arm64
FROM --platform=${IMAGE_PLATFORM} node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY prototype/app/package.json prototype/app/package-lock.json /app/prototype/app/
WORKDIR /app/prototype/app
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null \
    || npm install --omit=dev --ignore-scripts

WORKDIR /app
COPY prototype/app/ /app/prototype/app/
COPY prototype/data/ /app/prototype/data/
COPY docs/deliverables/ /app/docs/deliverables/
# 三入口 Pitch 配套物料（home.html → /materials/*）
COPY assets/posters/*.html /app/assets/posters/
COPY assets/posters/*.svg /app/assets/posters/
COPY assets/posters/qr-yingyan.png assets/posters/yingyan-experience-qr.png assets/posters/yingyan-experience-qr.svg /app/assets/posters/

WORKDIR /app/prototype/app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "require('http').get('http://127.0.0.1:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
