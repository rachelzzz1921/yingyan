# 鹰眼 v6 Prompt 真实评测台

对鹰眼 7 个核心 prompt 的 v6 版做**真实、多次、多模型**回归评测,失败驱动迭代到 v7。**零模拟:所有分数来自真调模型,原始输出可复核。**

## 这是什么 / 不是什么
- **是**:一个零依赖 Node 评测 harness + 47 个机器可判用例 + 真实结果与分析报告。
- **不是**:不替代主文档的三审三验;P5 真位置去偏的"修"在调用层,本台只负责**测**出来。

## 快速开始
```bash
# 1) 准备 key(任选其一;本仓默认从 ../prototype/app/.env 取 MINIMAX_API_KEY)
cp .env.example .env   # 填入 MINIMAX_API_KEY=sk-...   (绝不提交)

# 2) 跑某个 prompt 的回归(N 次、可选多模型)
cd evals
node run.js --prompts P1 --n 5 --models debater,alt --temp 0.2 --tag try

# 3) P5 位置交换 + 异源裁判
node p5_swap_runner.js --judges judge,debater --n 5 --temp 0.1 --tag p5

# 4) v7 全量重跑(P1/P2/P4/P6 用 v7,其余回退 v6)
node run.js --prompts P1,P2,P3,P4,P6,P7 --n 5 --models debater,alt --v7 --tag v7

# 5) 汇总/报告
node failures.js --in v7.json        # 列出未全绿项
node metrics.js  --in v7.json --p5 p5.json   # 6 个命名指标通过率
node report.js   --in v7.json --p5 p5.json --out ../results/report_tables.md
```
或一键:`bash run_baseline.sh`(v6 基线) / `bash run_v7.sh`(完整迭代周期)。

## 目录
```
prompts/        7 个 v6 全文(事实来源=主文档10 的 v6)
prompts_v7/     失败驱动迭代版(P1/P2/P4/P6)
evals/          providers(真实调用+缓存) / lib(JSON提取+断言引擎) / run / p5_swap_runner / metrics / report / failures / asserts/customChecks / cases/*.json
results/        baseline_*.json / v7_*.json / report*.md / evidence_appendix.md / raw/(原始输出)
CHANGELOG.md    v7 每条改动:改了什么/根因/对应失败用例/转绿否/回归
OPEN_ISSUES.md  仍开的洞:prompt已修 / 架构待办 / 离线待办 / 模型能力 / 环境限制
docs/           TASKS 台账 / 第二轮红队设计
```

## 关键诚实交代
- 本环境 `ANTHROPIC_API_KEY` 为空(Claude Code 走 OAuth)→ **未在目标模型 Claude 上跑**;改用真实 MiniMax(辩手 MiniMax-Text-01,异源裁判 abab6.5s-chat,同厂跨代非跨厂商)。
- 要在 Claude 上复测:给一个非空 `ANTHROPIC_API_KEY`,在 `providers.js` 加 anthropic provider(已预留),用例/断言原样复用。
- 详见 `results/00_methodology.md` 与 `results/report.md`。
