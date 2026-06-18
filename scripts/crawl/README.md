# KB1 公开数据爬虫

国家医保局 / 江苏省医保局政务 CMS 低频抓取，产出写入 `prototype/data/kb/` 并同步 `public-data-corpus/kb/`。

## 依赖

```bash
cd scripts/crawl && npm install
```

## 第一批（MVP）

```bash
node run.mjs --phase batch1
```

种子见 [`seeds.batch1.json`](seeds.batch1.json)：

1. col109 两库分批 xlsx
2. 2025 典型问题清单
3. 条例实施细则（按条切分）
4. 2025 药品目录通知附件
5. 江苏药品目录数据库 xlsx

## 第二批（全面扩面）

```bash
node run.mjs --phase batch2
```

种子见 [`seeds.batch2.json`](seeds.batch2.json)：

1. col201 立项指南全批次（html-guide）
2. col73 曝光台 + col14 典型案例补充（case-exposure）
3. 江苏 col73935/74037 价格与 DRG 通知
4. 江苏 DRG 绩效评价办法全文
5. col109 两库增量监控
6. 药品目录 / 江苏药品 / 苏州护理 / code.nhsa PDF 轨

## 选项

- `--dry-run` 只列 URL，不写盘
- `--force` 重抓已见 URL；允许覆盖非「✅已核实」条目

## 输出

- 原始附件：`public-data-corpus/raw/`（gitignore）
- 状态：`state.json`（gitignore）
- KB JSON：`prototype/data/kb/kb1_policies.json`、`kb1_problem_lists.json`

## RAG 后续

```bash
# 在 prototype/app/.env 更新 RAG_CORPUS_VERSION 后
node scripts/ingest-kb-to-supabase.js
node scripts/embed-kb-chunks.js
node scripts/check-kb-env.js
```

调研文档：[`医保智能审核Agent_KB1_数据源调研.md`](../../医保智能审核Agent_KB1_数据源调研.md)
