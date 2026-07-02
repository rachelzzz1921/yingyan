# 鹰眼 · 桌面万能哨兵(F2)

**一个常驻小程序,三个零对接入口覆盖一切办公软件——全部本地运行,数据不出机。**

| 通道 | 状态 | 说明 |
|---|---|---|
| ② 文件夹监听 | ✅ 最小可用(sentinel.js) | 把 xlsx/csv/pdf/扫描件/json 拖进"收件箱"文件夹 → 自动导入+稽核 → 终端播报三档结论(🟥明确违规/🟨可疑/🟩干净)+ 打开报告页 |
| ① 剪贴板/Excel 审计 | ✅ 最小可用(clipboard-sentinel.js) | Excel 选中区域复制 → 哨兵侦测剪贴板变化 → 秒出三档。用轮询/显式触发替代全局热键(不引 Electron);真·全局热键+悬浮窗仍留路线图(需托盘壳) |
| ③ 截图 OCR 审计 | 路线图(D1-D2) | 截屏老 HIS/PDF 阅读器 → PP-Structure 本地识别 → 入引擎(sidecar :8787 已具备) |

## 通道① 剪贴板/Excel 审计 用法

```bash
# 先起引擎:cd prototype/app && node server.js  (:3700)
# 默认轮询(每1.5s侦测剪贴板变化,像结算表就自动审):
node plugin/desktop-sentinel/clipboard-sentinel.js --engine http://localhost:3700
# 审当前剪贴板一次即退(配 macOS 快捷指令绑系统快捷键=伪热键):
node plugin/desktop-sentinel/clipboard-sentinel.js --once
# 常驻不轮询,回车审一次(最省电):
node plugin/desktop-sentinel/clipboard-sentinel.js --no-poll
# 无 pbpaste 环境回退:管道喂 TSV
pbpaste | node plugin/desktop-sentinel/clipboard-sentinel.js --stdin
```

复用引擎 `/api/screening/rows`(行级筛查,与 1000 条批量同一引擎)。剪贴板解析(列名词典+位置启发式)在本机完成——**原始整段剪贴板文本不外发,只把解析出的结构化医保字段(项目名/年龄/性别/数量/金额/追溯码等)POST 给你指定的引擎地址**;默认本地回环(localhost),指向非本地地址会显式告警。隐私门槛:必须有医保特征(药名/项目词或合法追溯码)才发引擎,带"名称/金额"表头的私密账单/密码表被挡在门外不外发。命中规则:TRACE-101 追溯码重复 / AGE-101 年龄限药 / F-001 性别冲突 / QTY-901 超常数量。macOS 优先(pbpaste),Win/Linux 分支预留。

## 用法

```bash
# 先起引擎
cd prototype/app && node server.js          # :3700
# 再起哨兵(默认监听 ~/Desktop/鹰眼哨兵收件箱,自动创建)
node plugin/desktop-sentinel/sentinel.js
# 或指定目录/引擎
node plugin/desktop-sentinel/sentinel.js /path/to/inbox --engine http://localhost:3700
```

路由逻辑:`.json` 且带 front_page/fee_list → 完整案卷 structured 摄取;其余(xlsx/csv/pdf/图片)→ intake 分槽解析合并。零 npm 依赖(Node 18+ 自带 fetch/fs.watch)。
