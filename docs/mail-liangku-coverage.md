# 邮件两库附件覆盖审计

生成时间：2026-07-03T09:15:18.652Z

## 摘要

| 口径 | 数量 |
|------|------|
| 原始清单（liangku_files.json） | 37 |
| 磁盘文件（含 zip 解压） | 40 |
| KB 直接引用 mail-liangku 行数 | 9997 |
| KB 引用文件数 | 34 |

## 四态矩阵

| 文件名 | 已下载 | KB引用 | 解析行 | 状态 |
|--------|--------|--------|--------|------|
| 1.“药品区分性别使用”规则对应知识点明细.xlsx | ✓ | 3 | 159 | kb_referenced |
| 2.“药品儿童专用”规则对应知识点明细.xlsx | ✓ | 85 | 95 | kb_referenced |
| 3.“药品限儿童使用”规则对应知识点明细.xlsx | ✓ | 13 | 13 | kb_referenced |
| 4.“药品限工伤保险”规则对应知识点明细.xlsx | ✓ | — | 9 | parseable_not_in_kb |
| 5.“药品限生育保险”规则对应知识点明细.xlsx | ✓ | — | 3 | parseable_not_in_kb |
| 6.“药品限就医方式”规则对应知识点明细.xlsx | ✓ | 15 | 41 | kb_referenced |
| 7.“药品限医疗机构级别”规则对应知识点明细.xlsx | ✓ | 1 | 62 | kb_referenced |
| 8.“药品限支付疗程”规则对应知识点明细.xlsx | ✓ | — | 29 | parseable_not_in_kb |
| 医疗.zip | ✓ | — | — | zip_bundle |
| 医疗保障基金智能审核和监控知识库框架体系（1.0版）.pdf | ✓ | 1 | 0 | kb_referenced |
| 医疗保障基金智能审核和监控规则库框架体系（1.0版）.pdf | ✓ | 1 | 0 | kb_referenced |
| 医疗保障基金智能审核和监控规则库规则分类与释义.pdf | ✓ | 1 | 0 | kb_referenced |
| 医疗保障基金智能监管规则库web系统功能.txt | ✓ | 1 | — | kb_referenced |
| 医疗保障基金智能监管规则库、知识库（2025年版）-1.pdf | ✓ | 6731 | — | kb_referenced |
| 医疗监控规则两库.zip | ✓ | — | — | zip_bundle |
| 第一批-1.药品区分性别使用.xlsx | ✓ | 481 | 481 | kb_referenced |
| 第一批-2.医疗服务项目区分性别使用.xlsx | ✓ | 391 | 391 | kb_referenced |
| 第一批-3.药品儿童专用.xlsx | ✓ | 271 | 271 | kb_referenced |
| 第一批-4.药品限儿童使用.xlsx | ✓ | 11 | 11 | kb_referenced |
| 第一批-5.医疗服务项目儿童专用.xlsx | ✓ | 30 | 30 | kb_referenced |
| 第七批“医疗服务项目重复收费”规则对应知识点明细.xlsx | ✓ | 900 | 900 | kb_referenced |
| 第三批-1药品限工伤保险.xlsx | ✓ | 9 | 9 | kb_referenced |
| 第三批-2药品限生育保险.xlsx | ✓ | 3 | 3 | kb_referenced |
| 第九批“药品限二线使用”规则对应知识点明细.pdf | ✓ | 1 | 1 | kb_referenced |
| 第九批“药品限二线使用”规则对应知识点明细.xlsx | ✓ | 110 | 1 | kb_referenced |
| 第二批“手术项目未按规定折价收费”规则对应知识点明细.pdf | ✓ | 378 | 0 | kb_referenced |
| 第二批“手术项目未按规定折价收费”规则对应知识点明细.xls | ✓ | — | 0 | on_disk_only |
| 第五批药品限医疗机构级别.xlsx | ✓ | 61 | 61 | kb_referenced |
| 第八批-1“医疗服务项目限定频次”规则对应知识点明细.xlsx | ✓ | 67 | 67 | kb_referenced |
| 第八批-2“医疗服务项目限年龄”规则对应知识点明细.xlsx | ✓ | 1 | 1 | kb_referenced |
| 第八批-3“医疗服务项目限支付疗程”规则对应知识点明细.xlsx | ✓ | 11 | 11 | kb_referenced |
| 第八批-4“医疗服务项目周期超频次”规则对应知识点明细.xlsx | ✓ | 14 | 14 | kb_referenced |
| 第六批药品限支付疗程.xlsx | ✓ | 30 | 30 | kb_referenced |
| 第十一批“中药饮片单复方均不予支付”规则对应知识点明细.xlsx | ✓ | 116 | 116 | kb_referenced |
| 第十一批“中药饮片单方使用不予支付”规则对应知识点明细.xlsx | ✓ | 37 | 116 | kb_referenced |
| 第十三批“药品限适应症”规则对应部分知识点明细.xlsx | ✓ | 66 | 66 | kb_referenced |
| 第十二批“药品限适应症”规则对应部分知识点明细.xlsx | ✓ | 57 | 57 | kb_referenced |
| 第十四批“药品限适应症”规则对应部分知识点明细.xlsx | ✓ | 43 | 43 | kb_referenced |
| 第十批“超互联网医院药品支付范围”规则对应知识点明细.xlsx | ✓ | 22 | 22 | kb_referenced |
| 第四批药品限就医方式.xlsx | ✓ | 35 | 35 | kb_referenced |

## 说明

- `book_pdf_separate_import`：2025 全书 PDF 走 `import-liangku-book-2025.mjs`，metadata.attachment 可能为 book 路径。
- `parseable_not_in_kb`：可解析但可能被 col109 同步覆盖或尚未 force 入库。
- 编码级合计 vs 品种级合计见 `docs/liangku-gap-2025-vs-2026.md`。
