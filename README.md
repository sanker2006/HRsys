# HRsys 绩效评价系统

HRsys 是一套面向企业内部绩效考核和 360 评价的系统，当前主线版本为 `V2.1`。项目包含后端服务、PC 管理端和移动端 H5 评分端，支持批次管理、评价矩阵配置、题目导入、评价关系生成、移动端评分、进度监控、数据统计和 Excel 导出。

## 项目结构

```text
HR开发2/
├─ backend/          后端服务，Node.js + Koa + TypeScript + sql.js
├─ admin/            PC 管理端，Vue 3 + Element Plus + Vite
├─ h5/               移动端评分端，Vue 3 + Vant + Vite
├─ scripts/          集成测试、测试数据和辅助脚本
├─ data/             本地数据库文件目录
├─ package.json      根目录构建和测试脚本
└─ README.md         项目说明
```

## 核心功能

- 管理端登录和权限校验
- 部门管理、人员与角色管理
- 人员启用/停用，停用人员不能登录 H5，且不参与新关系生成和数据统计
- 批次工作流：评价矩阵 -> 题目模板 -> 评价关系 -> 进度监控 -> 数据统计
- 自评题导入，支持按员工绑定不同题目
- 评价关系自动生成，生成前校验启用人员题目完整性
- H5 自我评价、同级互评、向下评价
- 部门负责人向下评价分档名额校验
- 管理端进度监控
- 管理端数据统计和 Excel 导出

## 角色与评价规则

系统角色：

- `main_leader`：主要领导，只能存在 1 人
- `division_leader`：分管领导，可绑定多个负责部门
- `manager`：部门负责人
- `staff`：普通员工
- `admin`：系统管理员

题目结构：

- 业绩评价：总分 70，最多 10 题，支持 1 位小数
- 综合评价：总分 30，最多 5 题，支持 1 位小数
- 部门负责人和普通员工需要自评
- 主要领导和分管领导不需要自评

评价关系：

- 普通员工与本部门其他员工同级互评，并对本部门负责人进行员工评议
- 同级互评只评价综合题，不评价业绩题
- 部门负责人对本部门员工向下评价，员工正式提交自评后才可评分
- 分管领导只评价其负责部门的部门负责人和员工
- 主要领导评价所有部门负责人和员工
- 领导评价部门负责人或部门内员工前，要求该部门负责人已完成本部门全部员工向下评分
- 领导评价普通员工时只录入综合总分，同时可查看员工自评和主管评分
- 领导评价部门负责人时按题逐项评价业绩和综合两部分

分档规则：

- 部门负责人给普通员工正式提交向下评价时校验分档名额
- `81-100` 人数最多为 `round(员工数 * 40%)`
- `71-80` 人数最多为 `round(员工数 * 30%)`
- `0-70` 下限由高分和中分名额自然约束
- 草稿不占用分档名额

## 数据统计

管理端每个批次提供“数据统计”模块，只统计部门负责人和普通员工，领导层仅作为评分来源。

统计列包括：

- 序号、部门、员工工号、员工姓名、角色
- 业绩-领导评价、业绩-自评价、业绩-计算分
- 综合-主要领导、综合-分管领导、综合-部门负责人评价
- 中层互评、员工评议、员工互评
- 综合-自评价、综合-计算分
- 最终总分、数据状态、缺失项

若必需评分来源缺失，最终总分显示 `-`，数据状态显示“数据缺失”。

## 环境要求

- Node.js 18+
- npm 9+

## 安装依赖

```bash
npm install
npm --prefix backend install
npm --prefix admin install
npm --prefix h5 install
```

## 环境变量

后端可使用 `backend/.env.example` 作为模板：

```bash
copy backend\.env.example backend\.env
```

常用配置：

```env
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
DB_PATH=./data/hr360.db
```

开发环境如果未设置 `JWT_SECRET`，后端会使用开发默认值；生产环境必须显式配置 `JWT_SECRET`。

## 本地启动

分别启动三个服务：

```bash
npm --prefix backend run dev
npm --prefix admin run dev
npm --prefix h5 run dev
```

默认地址：

- 后端 API：`http://localhost:3000/api/v1`
- 管理端：`http://localhost:5173`
- H5 端：`http://localhost:5174`

默认管理端账号：

- 账号：`admin`
- 密码：`admin123`

## 构建

根目录统一构建：

```bash
npm run build
```

等价于：

```bash
npm --prefix backend run build
npm --prefix admin run build
npm --prefix h5 run build
```

也可以单独构建：

```bash
npm run build:backend
npm run build:admin
npm run build:h5
```

## 生产运行

后端：

```bash
npm --prefix backend run build
npm --prefix backend run start
```

前端构建产物分别输出到：

- `admin/dist`
- `h5/dist`

本地验证静态产物可使用：

```bash
node serve-dist.mjs admin/dist 5173
node serve-dist.mjs h5/dist 5174
```

## 测试

集成测试：

```bash
npm run test:integration
```

该测试会启动独立测试数据库，覆盖主要业务流程：

- 用户、部门、批次创建
- 主要领导唯一性
- 题目导入校验
- 缺题时阻止生成评价关系
- 停用用户登录拦截
- 自评、同级互评、向下评价
- 部门负责人分档名额校验
- 批次过期提交拦截
- 数据统计接口和导出
- 简单并发压力测试

## V2.1 重点更新

- 管理端和 H5 端界面重构，降低移动端高亮白屏观感
- 向下评价改为“人员目录 -> 单人评分”流程
- 领导向下评价增加“部门清单 -> 部门人员 -> 评分详情”路径
- 员工互评增加对本部门负责人的综合评议，用于数据统计中的“员工评议”
- 领导评分解锁规则改为依赖部门负责人完成本部门全部员工评分
- 同级互评改为按人员进入详情评分
- 新增数据统计与 Excel 导出
- 新增人员启用/停用
- 生成评价关系前校验题目完整性，缺题不清空旧关系
- 评分接口统一校验，防止绕过前端规则提交非法数据
- 管理端人员页改为服务端分页，避免超过 20 人后页面缺失

## Git 信息

- 仓库：`https://github.com/sanker2006/HRsys`
- 当前开发分支：`V2.1`
- `V2` 分支保留为 V2 基线版本
