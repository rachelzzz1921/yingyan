# S4 回填改档
服务角色: 数据组
载体: 自动回填
优先级: P0

## 角色可见性
- 数据组
- 组长

## 输入 schema
- inspection_task.verify_result
- source_finding_id

## 输出 schema
- finding.onsite_result
- finding.nature
- review_feedback entry

## 依赖既有资产
- 三档分类
- priority-store
- 沉淀闭环 review_feedback

## LLM 降级路径
- 不使用 LLM
- 只执行四条流转规则
