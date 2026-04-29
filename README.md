# HRsys

HRsys 是一套用于企业内部绩效考核与 360 评价的系统。

当前仓库对应 `HR开发2` 版本，包含后端服务、PC 管理端和移动端评价页面，适用于部门管理、用户管理、评价批次管理、题目模板导入、评价关系生成以及员工评分流程。

## 一、项目结构

```text
HR开发2/
├─ backend/          后端服务（Node.js + Koa + TypeScript）
├─ admin/            PC 管理端（Vue 3 + Element Plus）
├─ h5/               移动端评价端（Vue 3 + Vant）
├─ package.json      根目录统一构建脚本
├─ serve-dist.mjs    静态产物本地服务脚本
└─ README-V2.md      早期版本说明
```

## 二、主要功能

- 管理员登录
- 部门管理
- 用户管理
- 评价批次管理
- 自评题模板导入
- 评价关系生成
- 自评、同层互评、向下评价
- 评分进度查看

## 三、技术栈

### 后端

- Node.js
- Koa
- TypeScript
- sql.js
- JWT
- zod

### 前端

- Vue 3
- TypeScript
- Vite
- Element Plus
- Vant
- Axios

## 四、环境要求

- Node.js 18 及以上
- npm 9 及以上

## 五、安装依赖

项目采用根目录加子项目独立依赖的方式，首次拉取后请分别安装：

```bash
npm install
npm --prefix backend install
npm --prefix admin install
npm --prefix h5 install
```

## 六、环境配置

后端启动前，需要先创建环境变量文件：

```bash
copy backend\.env.example backend\.env
```

至少需要确认以下配置项：

- `JWT_SECRET`
- `PORT`
- `CORS_ORIGIN`

说明：

- 数据库文件默认存放在 `backend/data/`
- `.env`、数据库文件、日志文件、`dist` 目录和 `node_modules` 已加入 `.gitignore`

## 七、本地开发启动

开发时需要分别启动三个服务：

```bash
npm --prefix backend run dev
npm --prefix admin run dev
npm --prefix h5 run dev
```

默认端口如下：

- 后端：`3000`
- 管理端：`5173`
- H5 端：`5174`

## 八、构建命令

根目录提供统一构建入口：

```bash
npm run build
```

等价于：

```bash
npm run build:backend
npm run build:admin
npm run build:h5
```

类型检查命令：

```bash
npm run typecheck
```

## 九、生产运行方式

后端构建完成后可直接运行：

```bash
npm --prefix backend run build
npm --prefix backend run start
```

前端构建完成后，会输出到各自的 `dist/` 目录。

如果需要本地验证构建产物，可使用根目录脚本启动静态服务：

```bash
node serve-dist.mjs admin/dist 5173
node serve-dist.mjs h5/dist 5174
```

该脚本会将前端 `/api` 请求代理到本地后端服务。

## 十、常用脚本

### 根目录

- `npm run build`
- `npm run build:backend`
- `npm run build:admin`
- `npm run build:h5`
- `npm run typecheck`

### backend

- `npm run dev`
- `npm run build`
- `npm run start`

### admin / h5

- `npm run dev`
- `npm run build`
- `npm run preview`

## 十一、接口前缀

后端接口统一前缀为：

```text
/api/v1
```

开发环境下，前端通过 Vite 代理访问后端接口。

## 十二、当前版本说明

本版本主要完成了以下整理和优化：

- 前后端结构拆分更清晰
- 后端构建产物稳定输出到 `dist`
- 数据库存储路径统一到 `backend/data`
- 登录流程增加参数校验
- 评价页面支持批量评分流程
- 管理端与 H5 端均可独立构建和部署

## 十三、仓库信息

- GitHub 仓库：<https://github.com/sanker2006/HRsys>
- 默认分支：`main`

## 十四、后续建议

- 补充正式部署脚本
- 增加测试数据初始化说明
- 补充接口文档
- 为批次、关系、评分流程增加自动化测试
