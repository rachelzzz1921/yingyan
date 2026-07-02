# 鹰眼 · 桌面万能哨兵(F2)

**一个常驻小程序,三个零对接入口覆盖一切办公软件——全部本地运行,数据不出机。**

| 通道 | 状态 | 说明 |
|---|---|---|
| ② 文件夹监听 | ✅ 最小可用(本目录 sentinel.js) | 把 xlsx/csv/pdf/扫描件/json 拖进"收件箱"文件夹 → 自动导入+稽核 → 终端播报三档结论(🟥明确违规/🟨可疑/🟩干净)+ 打开报告页 |
| ① 剪贴板热键审计 | 路线图(D1-D2) | Excel 里选中区域复制 → 全局热键 → 悬浮窗秒出结果(剪贴板天然携带 TSV;需托盘壳/Electron 提供全局热键) |
| ③ 截图 OCR 审计 | 路线图(D1-D2) | 截屏老 HIS/PDF 阅读器 → PP-Structure 本地识别 → 入引擎(sidecar :8787 已具备) |

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
