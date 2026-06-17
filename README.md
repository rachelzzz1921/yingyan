# 鹰眼 · 医保智能审核 Agent

[![CI](https://github.com/rachelzzz1921/yingyan/actions/workflows/ci.yml/badge.svg)](https://github.com/rachelzzz1921/yingyan/actions/workflows/ci.yml)

医保智能体黑客松参赛项目。多 Agent 辩论式医保审核引擎，含完整文档、Prompt 工程、可运行原型与真实评测台。

## 目录结构

```
鹰眼/
├── docs/              项目文档（按阅读顺序编号）
│   ├── 00-项目主文档.md          ← 入口，v1.6 最新版
│   ├── 01-审核规则库雏形.md
│   ├── 02-知识库建设方案.md
│   ├── 03-肿瘤专科规则包.md
│   ├── 04-竞品与开源选型.md
│   ├── 05-竞品二轮与论文武器库.md
│   ├── 06-Pitch文案.md
│   ├── 07-架构升级蓝图.md
│   ├── 08-规则逻辑评审.md
│   └── archive/                  旧版主文档 v1.0–v1.5
├── prompts/           Prompt 工程与开发指令
│   ├── Prompt工程全集-v1.md
│   ├── Prompt工程全集-v2-红队迭代.md   ← 最新
│   ├── 品牌元素生成.md               ← GPT 品牌 Prompt
│   ├── 评测任务书.md
│   ├── Claude-Cowork迭代指令.md
│   └── claude-code-自迭代提示词-v2.md
├── prototype/         可运行 Web 原型（Node.js）
│   └── app/public/dashboard.html  ← 动态项目看板
├── yhf/               变更门禁 Harness
├── eval/              Prompt 真实评测台（47 用例）
├── docs/ROADMAP.md    迭代路径 Phase 4–8
├── application/       黑客松申请材料（简历、作品集）
├── assets/            架构图、品牌规范、GPT 参考图
│   └── brand/         DESIGN.md · DESIGN-v2-gpt.md · gpt-v2/*.png
├── export/            Word 导出版
└── tools/             Prompt 验证台 HTML（离线）
```

## 快速开始

### 原型演示
```bash
cd prototype/app
npm install
node server.js
# 浏览器打开 http://localhost:3456
# 或 http://localhost:3700（默认端口）
# 项目看板 http://localhost:3700/dashboard.html
```

### 在线预览（私有 GitHub 仓库 + Render）

仓库保持 **Private**；预览站点由 [Render](https://render.com) 托管（免费 HTTPS 域名，与 GitHub 仓库可见性独立）。

1. 登录 [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. 连接 GitHub 账号，选择私有仓库 `rachelzzz1921/yingyan`（需授权私有仓库访问）
3. Render 读取根目录 `render.yaml`，创建服务 `yingyan-preview`
4. 部署完成后访问：`https://yingyan-preview.onrender.com`（域名以 Dashboard 为准）
5. 之后每次 `git push main` 会自动重新部署

云端默认 `RAG_MODE=json`（离线 KB，无需 Supabase）。若需 LLM/RAG Live，在 Render 环境变量中配置 `.env.example` 里的密钥。

本地验证 Docker 构建：

```bash
docker build -f prototype/app/Dockerfile -t yingyan-preview .
docker run --rm -p 3700:3700 yingyan-preview
```

### Prompt 评测
```bash
cd eval
cp .env.example .env   # 填入 MINIMAX_API_KEY
bash run_baseline.sh   # v6 基线
bash run_v7.sh         # v7 迭代
```

### YHF 变更门禁（Oracle + G0 红线）
```bash
bash yhf/run.sh              # 报告 → yhf/results/gate_latest.md
bash yhf/run.sh --strict     # CI：干净件误报≠0 则 exit 1
node yhf/gate.js --layer engine,shadow --rule T-201
```

## 阅读路径

1. **了解项目** → `docs/00-项目主文档.md`
2. **Pitch 准备** → `docs/06-Pitch文案.md`
3. **Prompt 细节** → `prompts/Prompt工程全集-v2-红队迭代.md`
4. **跑通原型** → `prototype/README.md`
5. **评测结果** → `eval/results/report.md`

## 仓库维护

- AI Agent 协作上下文：`AGENTS.md`
- 贡献与验证流程：`CONTRIBUTING.md`
- 安全与敏感数据规则：`SECURITY.md`
- CI：`.github/workflows/ci.yml`，默认执行规则构建与 `bash yhf/run.sh --strict`
