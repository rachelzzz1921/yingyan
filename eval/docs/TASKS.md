# 任务台账 TASKS.md(唯一事实来源,只进不丢)

> 依据 doc11 任务书 + claude-code 自迭代提示词 v2 的"任务台账与防遗漏"纪律。
> 状态:TODO / DOING / DONE / DEFERRED(+原因)。来源:doc11=任务书要求,self=自规划,find=评测发现。

| # | 内容 | 来源 | 状态 | 备注 |
|---|---|---|---|---|
| 1 | 核验环境(联网/key/node/工具) | doc11§1 | DONE | Anthropic key 空(OAuth);MiniMax key 可用,4 模型族 |
| 2 | 锁定模型选型并写进报告 | doc11§占位B | DONE | 辩手=MiniMax-Text-01,异源裁判=abab6.5s-chat;见 00_methodology |
| 3 | 建产物结构(prompts/evals/results/...) | doc11§2 | DONE | 自带 git;.env gitignore |
| 4 | 提取 7 个 v6 全文到 prompts/ | doc11§2 | DONE | P1-P7 |
| 5 | 真实调用层(零模拟)+缓存+预算护栏 | doc11§3.1 | DONE | providers.js;raw 缓存 |
| 6 | 稳健 JSON 提取(围栏+配平扫描) | doc11§5 | DONE | 修复了首版误报 JSON 不合规 |
| 7 | P1 端到端打通 pipeline | doc11§8.2 | DONE | smoke 验证;真实捕获篡改注入 |
| 8 | 7 prompt 的机器可判断言(种子C+新增对抗) | doc11§6 | DONE | 39 用例,cases/*.json + customChecks |
| 9 | P5 swap runner(A/B交换+异源裁判+位置一致率) | doc11§5 | DONE | p5_swap_runner.js;含自报vs实测对比 |
| 10 | 跑 baseline(全用例×N=5×双模型,低温) | doc11§8.4 | DOING | run_baseline.sh 后台运行中 |
| 11 | P5 位置交换基线(双裁判) | doc11§6 | DOING | 同上脚本 |
| 12 | 失败三级分类(prompt缺陷/模型能力/期望偏严) | doc11§4 | TODO | 待 baseline 完成 |
| 13 | 继续红队:构造 v2.0 未预见的新对抗输入(round2) | doc11§3.5 | TODO | 已先放部分(P1-R4/R5/R6);失败驱动补强 |
| 14 | 失败驱动迭代 v7(只改能在 prompt 层修的) | doc11§4 | TODO | 待确认失败一致性 |
| 15 | v7 全量重跑防回归 | doc11§4 | TODO | |
| 16 | 高温(0.7)鲁棒性档 | doc11§3.6 | TODO | 辩手模型 |
| 17 | 出 report.md(每prompt×每指标真实通过率,带方差,按模型分) | doc11§6 | TODO | 表格由 report.js 生成,数字不手填 |
| 18 | OPEN_ISSUES.md(prompt已修/架构/离线/模型能力) | doc11§6 | DOING | 架构/离线/环境部分已写;经验部分待填 |
| 19 | CHANGELOG.md 完整可追溯 | doc11§4 | DOING | harness 改动已记;v7 待填 |
| 20 | 逐条对照 §6 验收 + 遗漏扫描 + KPT 复盘 | v2§9 | TODO | 最终报告 |

## 防遗漏触发记录(随时追加)
- (无新增"稍后/下一轮"承诺待录)
