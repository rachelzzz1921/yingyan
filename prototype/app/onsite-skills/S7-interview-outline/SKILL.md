# S7 询问提纲生成
服务角色: 医疗组
载体: 哨兵热键技能 + 任务卡按钮
优先级: P1

## 角色可见性
- 医疗组
- 组长

## 输入 schema
- inspection_task
- rule_id
- task_type

## 输出 schema
- outline: string[]

## 依赖既有资产
- 任务卡
- 规则 DSL 元数据
- schema 校验包装器

## LLM 降级路径
- structuredCall
- 确定性模板
- 人工补写
