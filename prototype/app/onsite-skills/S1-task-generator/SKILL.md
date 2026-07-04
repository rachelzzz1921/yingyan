# S1 任务生成器
服务角色: 组长/后方
载体: 工作台现场模式视图
优先级: P0

## 角色可见性
- 组长
- 数据组

## 输入 schema
- selected: [{case_id, finding_id}]
- org_id: string
- period: string

## 输出 schema
- inspection_plan
- inspection_task[]
- inspection_station[]

## 依赖既有资产
- 批量筛查与优先队列
- 规则 DSL 元数据
- priority/store.json findings_cache

## LLM 降级路径
- 不使用 LLM
- 队列缺缓存时回退确定性稽核
