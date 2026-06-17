# 鹰眼 · 稽核工作台（在线预览 / Render 部署）
FROM node:20-alpine

WORKDIR /app

COPY prototype/app/package.json prototype/app/package-lock.json ./
RUN npm ci

COPY prototype/app/ ./
COPY prototype/data/ /data/

RUN npm run build:rules

ENV NODE_ENV=production
ENV RAG_MODE=json
ENV PORT=3700

EXPOSE 3700

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3700)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
