# S6 自查比对站
服务角色: 组长/政策组
载体: 工作台现场模式视图
优先级: P1

## 角色可见性
- 组长
- 政策组
- 数据组

## 输入 schema
- reported_rule_ids: string[]

## 输出 schema
- missed_top[]
- missed_count

## 依赖既有资产
- 院端自查 checklist/diff
- 优先队列 findings_cache

## LLM 降级路径
- 不使用 LLM
- 演示版按 rule_id 数组 diff
