# vendor/ 第三方离线资产

## opendrg(待入库,需人工执行一次)

设计(赛前迭代文档 §五/Q5):DRG 分组不自造,vendor 开源 CHS-DRG 分组器 OpenDRG(JS 版)。
自动化助手无权克隆外部仓库(安全策略),需人工执行:

```bash
cd "$(git rev-parse --show-toplevel)"
git clone --depth 1 https://github.com/OpenDRG/OpenDRG.git vendor/opendrg-tmp
# 确认 JS 版分组器入口后整理为 vendor/opendrg(留 require 入口 index.js,导出 group(caseInfo)),删除 .git
```

接入点已就位:`prototype/app/engine/drg-grouper.js` 启动时探测 `vendor/opendrg`,
在库即走 OpenDRG 全量分组,不在库自动退演示子集数据表
(`prototype/data/kb/drg_payment_standards.json`,CHS-DRG 2.0 演示病种子集,界面如实标注来源)。
第 35 条差额算钱两形态共用,无需改代码。

入库后请在本文件记录:来源 commit hash、License、分组方案版本。
