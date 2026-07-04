# S2 科室节点地图
服务角色: 组长/组员
载体: 工作台现场模式视图
优先级: P0

## 角色可见性
- 组长
- 医疗组
- 财务组
- 信息组
- 政策组
- 数据组

## 输入 schema
- inspection_plan
- inspection_station[]
- inspection_task[]

## 输出 schema
- static_svg_node_map
- route_a
- route_b

## 依赖既有资产
- inspection_task.station_id
- 工作台静态页面

## LLM 降级路径
- 不使用 LLM
- 禁止生成真实平面图
