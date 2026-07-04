# S3 任务卡 tick+取证挂载
服务角色: 各小组成员
载体: 工作台现场模式视图
优先级: P0

## 角色可见性
- 医疗组
- 财务组
- 信息组
- 政策组
- 数据组

## 输入 schema
- task_id: string
- verify_result: 属实|不属实|存疑
- verify_reason: string
- officers: string[2]
- evidence_payload: object

## 输出 schema
- inspection_task
- evidence_links[layer=4,source=onsite]

## 依赖既有资产
- evidence_links 物化关联
- 调用链留痕
- 规则 DSL 元数据

## LLM 降级路径
- 不使用 LLM
- 不属实缺理由直接拒绝
