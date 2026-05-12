# HRsys 绩效评价系统

HRsys 是一套企业内部绩效考核与 360 评价系统，当前主线版本为 `V2.1`。项目包含后端服务、PC 管理端和移动端 H5 评分端，支持批次管理、评价矩阵、题目模板、评价关系、移动端评分、进度监控、数据统计和 Excel 导出。

## 项目结构

```text
HR开发2/
├─ backend/                    后端服务，Node.js + Koa + TypeScript
├─ admin/                      PC 管理端，Vue 3 + Element Plus + Vite
├─ h5/                         移动端评分端，Vue 3 + Vant + Vite
├─ scripts/                    集成测试与辅助脚本
├─ docker-compose.postgres.yml 本机 PostgreSQL 配置
├─ data/                       本地 sql.js 测试数据目录
└─ README.md
```

## 核心功能

- 管理端登录和权限校验
- 部门管理、人员与角色管理、人员启用/停用
- 批次工作流：评价矩阵 -> 题目模板 -> 评价关系 -> 进度监控 -> 数据统计
- 自评题导入，支持每个员工绑定不同题目
- 生成评价关系前校验启用人员题目完整性
- H5 自我评价、同级互评、向下评价
- 部门负责人向下评价分档名额校验
- 领导按部门进入向下评价
- 管理端进度监控、数据统计和 Excel 导出

## 角色与规则

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

- 普通员工互评本部门其他员工，并评价本部门负责人，只评价综合题
- 部门负责人之间互评，只评价综合题
- 部门负责人对本部门员工向下评价，员工正式提交自评后才可评价
- 分管领导只评价负责部门内的部门负责人和员工
- 主要领导评价所有部门负责人和员工
- 领导评价某部门负责人或该部门员工前，要求该部门负责人已完成本部门全部员工评分

## 数据库

V2.1 支持两种数据库驱动：

- PostgreSQL：推荐主路径，用于提升并发能力
- sql.js：保留为本地开发回退和旧数据迁移来源

### PostgreSQL 本机启动

本机需要先安装 Docker Desktop，并确保命令行可使用 `docker`。

```bash
docker compose -f docker-compose.postgres.yml up -d
```

复制环境变量模板：

```bash
copy backend\.env.example backend\.env
```

在 `backend/.env` 中启用 PostgreSQL：

```env
DB_DRIVER=postgres
DATABASE_URL=postgres://hrsys:hrsys@127.0.0.1:15432/hrsys
PG_POOL_MAX=20
```

初始化 schema：

```bash
npm --prefix backend run db:init
```

从旧 sql.js 数据库迁移：

```bash
npm --prefix backend run db:migrate:from-sqljs
```

默认迁移源是 `backend/data/hr360.db`。如需指定：

```bash
set SQLJS_SOURCE=D:\HR开发\HR开发2\backend\data\hr360.db
npm --prefix backend run db:migrate:from-sqljs
```

迁移后校验：

```bash
npm --prefix backend run db:check
```

### sql.js 回退

不配置 `DATABASE_URL` 且不设置 `DB_DRIVER=postgres` 时，后端会继续使用 sql.js：

```env
DB_PATH=./data/hr360.db
```

## 本地启动

分别启动三个服务：

```bash
npm --prefix backend run dev
npm --prefix admin run dev
npm --prefix h5 run dev
```

默认地址：

- 后端 API：http://localhost:3000/api/v1
- 管理端：http://localhost:5173
- H5：http://localhost:5174

默认管理端账号：

- 账号：`admin`
- 密码：`admin123`

## 构建

```bash
npm run build
```

等价于：

```bash
npm --prefix backend run build
npm --prefix admin run build
npm --prefix h5 run build
```

## 测试

集成测试：

```bash
npm run test:integration
```

覆盖内容包括：

- 登录、人员启停、主要领导唯一性
- 题目导入校验、缺题阻止关系生成
- 自评、同级互评、向下评价
- 员工评价本部门负责人
- 领导评分解锁规则
- 分档名额校验
- 批次过期拦截
- 统计接口和导出
- 基础并发读写压测

PostgreSQL 专项压测：

```bash
set DB_DRIVER=postgres
set DATABASE_URL=postgres://hrsys:hrsys@127.0.0.1:15432/hrsys
npm --prefix backend run build
npm --prefix backend run pressure:postgres
```

压测会输出总请求数、RPS、p50/p95/p99、错误数和 PostgreSQL 连接状态。默认执行读接口、草稿写入、进度/统计刷新。正式提交会改变业务数据，默认跳过；如需压测正式提交，指定一个可提交的关系：

```bash
set FORMAL_RELATION_ID=123
npm --prefix backend run pressure:postgres
```

## 生产建议

- 正式环境使用 PostgreSQL，不建议继续使用 sql.js 文件库
- 设置强随机 `JWT_SECRET`
- 根据机器 CPU、内存和 PostgreSQL 配置调整 `PG_POOL_MAX`
- 前端静态资源建议放到独立静态服务或 CDN
- 后端部署在稳定有线网络或云主机，不建议依赖家用无线网络公网穿透

## Git 信息

- 仓库：https://github.com/sanker2006/HRsys
- 当前开发分支：`V2.1`
- `V2` 分支保留 V2 基线版本
