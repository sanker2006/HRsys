import Koa from 'koa';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import { config } from './config/index.js';
import { error } from './middleware/error.js';
import { performance } from './middleware/performance.js';
import router from './route/index.js';

const app = new Koa();
app.proxy = config.trustProxy;

app.use(performance);
app.use(error);
app.use(cors({
  origin: (ctx: any) => {
    const origin = ctx.get('Origin');
    if (!origin) return '';
    if (config.corsOrigins.includes('*')) return origin;
    return config.corsOrigins.includes(origin) ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Server-Timing', 'X-Request-ID'],
}));
app.use(koaBody({
  jsonLimit: '10mb',
  formLimit: '10mb',
  multipart: true,
  includeUnparsed: true,
  formidable: {
    maxFileSize: 10 * 1024 * 1024,
    multiples: false,
  },
}));
app.use(router.routes()).use(router.allowedMethods());

export default app;
