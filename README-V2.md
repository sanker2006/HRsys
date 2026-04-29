# HR-360 V2.0

V2.0 是在原 `hr-360` 基础上的工程优化版，重点处理了构建稳定性、安全配置、数据库位置、分页性能和部分乱码文案。

## 主要变化

- 后端正式构建排除了临时数据库脚本和探针脚本。
- `sql.js` 和 `@koa/cors` 增加本地类型声明，后端 `tsc` 可通过。
- 数据库默认写入 `backend/data/hr360.db`，不再污染 `src/db` 源码目录。
- JWT 密钥和 CORS 白名单改为环境变量配置，生产环境必须提供 `JWT_SECRET`。
- 用户列表、关系列表分页下沉到 SQL 查询层。
- 抽取 `backend/src/db/query.ts`，减少 model 里的重复查询代码。
- 修复关系生成中自评数量虚高的问题。
- 登录接口接入 `zod` 参数校验。
- 根目录增加统一构建脚本。

## 启动前配置

复制 `backend/.env.example` 为 `backend/.env`，并修改 `JWT_SECRET`。

## 验证命令

```bash
npm run build
```

也可以单独验证：

```bash
npm run build:backend
npm run build:admin
npm run build:h5
```
