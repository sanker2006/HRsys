# HRsys 绩效评价系统

HRsys 是一套企业内部绩效评价系统，当前主线版本为 `V2.1`。项目包含后端服务、PC 管理端和移动端 H5，支持批次管理、评价矩阵、题目模板、评价关系、移动端评分、进度监控、数据统计、Excel 导出，以及独立的实习生打卡模块。

## 技术栈

- 后端：Node.js + Koa + TypeScript
- 管理端：Vue 3 + Vite + Element Plus
- 移动端：Vue 3 + Vite + Vant
- 数据库：MySQL 8
- 文件导出：ExcelJS

## 项目结构

```text
HR开发2/
├─ backend/                 后端服务
├─ admin/                   PC 管理端
├─ h5/                      移动端 H5
├─ scripts/                 集成测试脚本
├─ docker-compose.mysql.yml 本机 MySQL 配置
└─ README.md
```

## 核心功能

- 管理端登录和权限校验
- 部门管理、人员与角色管理、人员启用/停用
- 批次工作流：评价矩阵 -> 题目模板 -> 评价关系 -> 进度监控 -> 数据统计
- 每人每批次独立题目模板，支持业绩评价和综合评价
- 人员与题目 CSV 导入支持 UTF-8、GBK/GB18030、单元格内换行，并按表格逻辑行返回错误；人员页可下载带示例数据的导入模板
- 评价关系支持预览后增量生成，只补充缺失关系，不覆盖旧关系、草稿和正式答案
- 题目导入支持空题行跳过、相同题目不重复写入，产生评分后自动锁定题目
- 批次支持为部门负责人和员工上传个人总结，管理端可按人员查看上传状态、替换、下载和删除
- 个人总结支持 `.doc`、`.docx`，单文件上限 10 MB；评价人仅能在自己的评价任务中下载被评价人的总结
- H5 自我评价、同级互评、向下评价
- 部门负责人向下评价分档名额校验
- 领导按部门进入向下评价
- 管理端数据统计和 Excel 导出
- 独立实习生账号、移动端打卡、月度/年度统计和导出

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

- 普通员工互评本部门其他员工，并评价本部门负责人，只评价综合题
- 部门负责人之间互评，只评价综合题
- 部门负责人对本部门员工向下评价，员工正式提交自评后才可评价
- 分管领导只评价负责部门内的部门负责人和员工
- 主要领导评价所有部门负责人和员工
- 领导评价某部门负责人或该部门员工前，要求该部门负责人已完成本部门全部员工评分
- 草稿和进行中批次可按当前评价矩阵增量补充关系；已结束或过期批次禁止生成
- 增量生成前显示新增关系、新增任务和可能重新计算统计分的人员，确认后才写入
- 新增人员评分前旧统计结果保持不变；新评分提交后，相关互评平均分和最终分重新计算
- 已有草稿、正式答案或答案明细的关系不能删除，对应人员题目不能修改

## 实习生打卡模块

- 管理端入口：`/interns` 实习生管理，`/intern-attendance` 实习生打卡统计
- H5 入口：`/intern/login`
- 登录方式：手机号 + 身份证后四位
- 打卡证据规则：GPS 和照片至少提供一个；GPS 获取失败、拒绝或超时时，必须上传照片
- 打卡时间以服务器时间为准，按 `Asia/Shanghai` 自然日统计
- H5 个人记录沿用日历口径：一天有效打卡 2 次及以上为出勤，0 或 1 次为缺勤
- 管理端考勤报表支持按月或自定义起止日期查询，范围最多 366 天；2 次及以上计出勤，1 次计缺勤，0 次单独统计为无打卡
- 管理端导出一个 Excel，包含“出勤统计”和“原始打卡记录”两个工作表；出勤统计按一天一列展示最早和最晚有效打卡时间
- 原始记录支持服务端分页和照片查看，照片接口仅管理员可访问且禁止缓存
- 管理员补卡、驳回、恢复、作废均采用事件追加方式，不直接覆盖原始记录

## MySQL 本地启动

先启动 Docker MySQL：

```bash
docker compose -f docker-compose.mysql.yml up -d
```

复制后端环境变量模板：

```bash
copy backend\.env.example backend\.env
```

默认数据库连接：

```env
DATABASE_URL=mysql://hrsys:hrsys@127.0.0.1:13306/hrsys
```

初始化 schema：

```bash
npm --prefix backend run db:init:mysql
```

从旧 sql.js 文件库迁移数据：

```bash
npm --prefix backend run db:migrate:from-sqljs:mysql
```

默认迁移来源是：

```text
backend/data/hr360.db
```

如需指定来源：

```bash
set SQLJS_SOURCE=D:\HR开发\HR开发2\backend\data\hr360.db
npm --prefix backend run db:migrate:from-sqljs:mysql
```

迁移后校验：

```bash
npm --prefix backend run db:check:mysql
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

实习生打卡专项测试：

```bash
npm --prefix backend run test:intern-attendance
npm --prefix backend run test:personal-summary
```

覆盖内容包括：

- 登录、人员启停、主要领导唯一性
- 题目导入校验、缺题阻止关系生成
- 已评价批次增量加入新部门、并发幂等生成、旧关系和答案保护
- 题目相同内容跳过、已评分题目锁定、危险删除拦截
- 自评、同级互评、向下评价
- 员工评价本部门负责人
- 领导评分解锁规则
- 分档名额校验
- 批次过期拦截
- 数据统计和导出
- 实习生打卡、照片审计、补卡、驳回、日期范围统计、分页记录和双工作表导出

## MySQL 压测

先构建后端：

```bash
npm --prefix backend run build
```

运行压测：

```bash
npm --prefix backend run pressure:mysql
```

压测会输出总请求数、RPS、p50/p95/p99、错误数和 MySQL 连接状态。默认执行读接口、草稿写入、进度/统计刷新。正式提交会改变业务数据，默认跳过；如需压测正式提交，指定一个可提交关系：

```bash
set FORMAL_RELATION_ID=123
npm --prefix backend run pressure:mysql
```

## 生产建议

- 正式环境使用独立 MySQL 实例，不建议依赖本机 Docker 数据卷
- 设置强随机 `JWT_SECRET`
- 根据机器 CPU、内存和 MySQL 配置调整 `MYSQL_POOL_MAX`
- 前端静态资源建议部署到独立静态服务或 CDN
- 后端部署在稳定有线网络或云主机，不建议依赖家用无线网络公网穿透

## Git 信息

- 仓库：https://github.com/sanker2006/HRsys
- 当前开发分支：`V2.1`
- `V2` 分支保留 V2 基线版本
