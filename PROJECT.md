# HR-360 项目配置清单

> 本文件是项目的唯一真相来源。接手项目的任何人或 Agent，**必读此文件**。

---

## 一、项目基本信息

| 字段 | 内容 |
|------|------|
| 项目名称 | HR-360 360度绩效评价系统 |
| 版本 | V1.3 |
| 数据库 | SQLite（sql.js 内存数据库） |
| 架构 | 三端：PC管理端 + H5评价端 + Node.js后端 |
| 项目根目录 | `d:\HR开发\hr-360\` |
| 最后更新 | 2026-04-20 |

---

## 二、当前目录结构

```
hr-360/
├── cloudflared-all.bat    ← 一键启动脚本（Cloudflare Tunnel，自动捕获 URL）
├── backend/               ← Node.js 后端（主）
│   ├── src/
│   │   ├── main.ts    ← 入口，启动命令见下方
│   │   ├── db/
│   │   │   ├── index.ts   ← DB 初始化，路径：src/db/hr360.db
│   │   │   ├── hr360.db   ← 当前数据库（12用户+5部门）
│   │   │   ├── schema.sql ← V1.3 表结构（最新）
│   │   │   └── migrate_department.ts
│   │   ├── model/     ← 数据模型
│   │   └── route/     ← API 路由
│   └── package.json
├── admin/              ← PC 管理端（Vue3 + Element Plus）端口 5173
│   ├── src/api/request.ts  ← baseURL: '/api/v1'（走 Vite proxy）
│   └── src/views/      ← Dashboard/Batch/EvalMatrix/SelfQuestion/Relation/Progress/User/Department
├── h5/                 ← H5 评价端（Vue3 + Vant 4）端口 5174
│   ├── src/api/request.ts  ← baseURL: '/api/v1'（走 Vite proxy）
│   └── src/views/      ← Login/Home/Evaluate/EvalForm/MyEvaluations
└── docs/               ← 文档（PRD、数据库设计、测试报告）
```

---

## 三、快速启动

### 一键启动（推荐：Cloudflare Tunnel）
```
d:\HR开发\cloudflared-all.bat
```
**自动完成**：清理旧进程 → 启动 3 个 Cloudflare 隧道（frontend + backend 分别代理）

> ⚠️ Cloudflare trycloudflare.com 域名是**临时的**，每次重启都会变。
> 查看新地址：`type D:\HR开发\cloudflare_admin.log`

**⚠️ 不要提交任何公网 URL 到 Git！** `.env.local` 已在 `.gitignore` 中（现已空，API 调用走 proxy，不依赖外部 URL）。

---

## 四、数据库

### 路径
`d:\HR开发\hr-360\backend\src\db\hr360.db`

### 表结构（V1.3）

| 表名 | 说明 |
|------|------|
| `department` | 部门表（新增，V1.3.1） |
| `app_user` | 用户表 |
| `batch` | 评价批次 |
| `eval_matrix` | 评估矩阵 |
| `relation` | 评价关系 |
| `self_question` | 自评题目（宽表，content_1~10 + weight_1~10） |
| `answer` | 答案 |
| `log` | 日志 |

### 测试账号（2026-04-19 重建，2026-04-20 更新密码）

**H5登录：手机号 + 身份证后四位；统一密码 `admin123!@#`**

| 姓名 | 手机号 | 密码 | level | 部门 |
|------|--------|------|-------|------|
| 领导1 | 13800138011 | 1111 | leader | 领导层 |
| 领导2 | 13800138012 | 2222 | leader | 领导层 |
| 技术部负责人 | 13800138021 | 2121 | manager | 技术部 |
| 市场部负责人 | 13800138022 | 2222 | manager | 市场部 |
| 销售部负责人 | 13800138023 | 2323 | manager | 销售部 |
| 技术员工1 | 13800138031 | 3131 | staff | 技术部 |
| 技术员工2 | 13800138032 | 3132 | staff | 技术部 |
| 市场员工1 | 13800138041 | 4141 | staff | 市场部 |
| 市场员工2 | 13800138042 | 4142 | staff | 市场部 |
| 销售员工1 | 13800138051 | 5151 | staff | 销售部 |
| 销售员工2 | 13800138052 | 5152 | staff | 销售部 |

**管理端登录：admin / `admin123!@#`**

---

## 五、服务启动方式

### 一键启动（推荐）
```powershell
d:\HR开发\cloudflared-all.bat
```

### 手动启动（不推荐）

```powershell
# 1. 启动后端（端口 3000）
Start-Process -FilePath "D:\HR开发\hr-360\backend\node_modules\.bin\tsx.cmd" `
  -ArgumentList "watch src/main.ts" `
  -WorkingDirectory "D:\HR开发\hr-360\backend" -WindowStyle Hidden

# 2. 启动 cloudflared（3 个窗口）
#    cloudflared.exe tunnel --url http://localhost:3000
#    cloudflared.exe tunnel --url http://localhost:5173
#    cloudflared.exe tunnel --url http://localhost:5174
#    从日志捕获 backend URL（前端走 Vite proxy，无需更新 .env.local）

# 3. 启动前端
Start-Process -FilePath "D:\HR开发\hr-360\admin\node_modules\.bin\vite.cmd" -ArgumentList "--host 0.0.0.0 --port 5173" -WorkingDirectory "D:\HR开发\hr-360\admin" -WindowStyle Hidden
Start-Process -FilePath "D:\HR开发\hr-360\h5\node_modules\.bin\vite.cmd" -ArgumentList "--host 0.0.0.0 --port 5174" -WorkingDirectory "D:\HR开发\hr-360\h5" -WindowStyle Hidden
#    前端 API 请求走 Vite proxy → localhost:3000，无需配置 .env.local
```

---

## 六、Cloudflare Tunnel 内网穿透（2026-04-20 定稿）

| # | 严重度 | 描述 | 状态 |
|---|--------|------|------|
| 1 | 已解决 | ~~数据库测试数据丢失~~ | **已重建**（2026-04-19） |
| 2 | 待优化 | 后端无心跳机制，Star Office 状态可能卡住 | 待优化 |
| 3 | 已知 | Sprint 2 H5 无独立 Pinia store，auth 逻辑分散 | 不影响功能 |
| 4 | 已解决 | ~~系统管理员参与评价~~ | **已修复**（2026-04-19 深夜） |
| 5 | 已解决 | ~~cpolar 公网访问 network error~~ | **已改用 Cloudflare**（2026-04-20） |
| 6 | 已解决 | ~~cpolar allowedHosts 跨域限制~~ | **已修复**（2026-04-20） |
| 7 | 已知 | Cloudflare 域名临时，每次重启变化 | 自动更新，无需手动处理 |

---

## 六-2、Cloudflare Tunnel 核心原理

### 为什么用 Cloudflare
- 免费，无需注册账号
- 速度快，延迟低
- 比 cpolar 更稳定

### 核心：Windows 下后台启动 + 捕获输出

**唯一可靠写法**：
```powershell
Start-Process -FilePath "C:\Users\Tom\.cloudflare\cloudflared.exe" `
  -ArgumentList "tunnel --url http://localhost:3000" `
  -WorkingDirectory "D:\HR开发" -WindowStyle Hidden `
  -RedirectStandardError "D:\HR开发\cloudflare_backend.log"
```

❌ `start /b cmd /c ... > file` — 无法捕获 cloudflared 输出
❌ 单独 `Start-Process -WindowStyle Hidden` — 输出被吞掉
❌ `cmd /c start "" /b ...` — cmd 的输入重定向让输出丢失

**工作流程**：启动隧道 → 日志写入文件 → 等5~10秒 → 正则捕获 URL（前端通过 Vite proxy 走 localhost，无需更新 `.env.local`）

### vite.config.ts allowedHosts 配置
```ts
server: {
  allowedHosts: ['.cpolar.top', '.trycloudflare.com'],
}
```

### 日志文件
- `D:\HR开发\cloudflare_backend.log`
- `D:\HR开发\cloudflare_admin.log`
- `D:\HR开发\cloudflare_h5.log`

### 数据库安全铁律
**永远不内联 SQL/脚本。** 任何 DB 写操作必须写 `.ts` 文件再执行。PowerShell `npx tsx -e` 多行脚本会静默失败，禁止使用。

---

## 七、API 路由前缀

所有 API：`http://localhost:3000/api/v1/`

| 路径 | 方法 | 说明 |
|------|------|------|
| `/auth/login` | POST | 管理员登录（account+password） |
| `/auth/h5-login` | POST | H5 登录（phone+idCardTail） |
| `/auth/me` | GET | 获取当前用户信息 |
| `/batch` | GET/POST | 批次列表/创建 |
| `/batch/:id` | GET/DELETE | 批次详情/删除 |
| `/eval-matrix/:batchId` | GET/PUT | 评估矩阵 |
| `/relation/generate/:batchId` | POST | 生成评价关系 |
| `/relation` | GET | 查询关系（带 batch_id 参数） |
| `/self-question/:batchId/me` | GET | 自评题目 |
| `/self-question/import` | POST | 导入自评题目 |
| `/answer/self` | POST | 提交自评 |
| `/answer/total` | POST | 提交总分评价 |
| `/answer/progress/:batchId` | GET | 进度 |
| `/answer/admin/progress/:batchId` | GET | 管理端进度 |
| `/department/` | GET/POST | 部门列表/新增 |
| `/department/:id` | PUT/DELETE | 修改/删除部门 |

---

## 八、后续开发方向（Sprint 3+）

- 数据统计与权重计算分析（Sprint 2 第二阶段）
- 催办通知：H5 端内通知机制
- H5 登录 SQL 注入修复（改精确比对 `=`）

---

*本文档随项目更新维护，最近一次更新：2026-04-20*
