# S10 争议研判
服务角色: 组长/集体决策
载体: 合议模块新入口
优先级: 预览

## 角色可见性
- 组长
- 政策组
- 数据组

## 输入 schema
- finding_id: string
- defense_statement: string

## 输出 schema
- collective_decision_record

## 依赖既有资产
- 三人格合议模块
- KB 引用强校验
- 调用链留痕

## LLM 降级路径
- 预生成示例产物
- 正式逻辑复用 triPersonaDebate
