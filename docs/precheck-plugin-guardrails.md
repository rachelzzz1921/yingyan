# 事前提醒插件防回归指南

> 背景：2026-07 曾因 `/api/precheck` 变量顺序错误 + 插件吞掉 `{error}`，导致 MockHIS **S1（未成年+喹诺酮）** 误显示「合规放行」。本文档固化约束，避免重演。

## 架构边界

| 层 | 文件 | 职责 |
|---|---|---|
| HTTP | `server.js` → `/api/precheck` | CORS、入参校验、调用 runner |
| 编排 | `engine/precheck-runner.js` | AGE-101（主引擎）+ F/T/B（原生检测器）合并 |
| 原生规则 | `engine/precheck-native.js` | 开单时点可见输入（性别/靶向/限定支付） |
| DRG | `engine/precheck-drg.js` | 编码员 C1/C2/C0 |
| 医生 UI | `public/plugin/yingyan-precheck.js` | 浮层 + 台账 |
| 编码/结算 UI | `public/plugin/yingyan-disposition.js` | 容器内处置闭环 |
| 扩展 | `plugin/browser-extension/` | 与内嵌演示**同源** precheck 脚本 |

**禁止**在 `server.js` 重复编排逻辑；**禁止**把 `/api/audit` 统一管线改动直接套进 precheck（二者 intentionally 分离）。

## 演示场景契约（G7 门禁）

### MockHIS 开单（`mockhis.html`）

| 场景 | 必命中规则 | 干净件 |
|---|---|---|
| S1 未成年+喹诺酮 | AGE-101 | |
| S2 女性+PSA | F-001 | |
| S3 奥希替尼无基因检测 | T-201 | |
| S4 白蛋白/波生坦超限定 | B-201 | |
| S0 氨氯地平 | | ✅ |

### 编码员 DRG（`coder-station.html`）

| 场景 | 必命中 | 干净件 |
|---|---|---|
| C1 重症编码无病历依据 | D-401 | |
| C2 重症+有依据 | | ✅ |
| C0 普通肺炎 | | ✅ |

## 三类典型故障模式

### 1. TDZ / require 顺序

症状：接口 500，`error` 含 `before initialization`。  
防护：`precheck-runner.js` 顶部 require；`verify-precheck-plugin.js` 扫描顺序。

### 2. 错误伪装成合规

症状：绿条「合规放行」，footer 有小字异常。  
防护：客户端必须 `if (j.error || !r.ok)`；`showOverlay` 分支 `result.error` → 红色「事前预检未完成」。

### 3. 双份脚本漂移

症状：内嵌演示正常、浏览器扩展仍误报（或反之）。  
防护：`cp` 同步 + `verify-precheck-plugin.js` SHA 比对。

## 变更检查清单

- [ ] 逻辑改在 `precheck-runner.js` / `precheck-native.js`，非 `server.js` 大段复制
- [ ] 改 `yingyan-precheck.js` 后同步 `plugin/browser-extension/`
- [ ] `node scripts/verify-precheck-plugin.js` 通过
- [ ] `bash yhf/run.sh --strict` 通过（G7）
- [ ] 手动：`mockhis.html` S1 有命中、S0 绿条放行

## 相关命令

```bash
node scripts/verify-precheck-plugin.js
bash yhf/run.sh --strict
cp prototype/app/public/plugin/yingyan-precheck.js plugin/browser-extension/
```
