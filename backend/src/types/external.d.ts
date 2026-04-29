declare module '@koa/cors' {
  import type { Middleware } from 'koa';

  interface CorsOptions {
    origin?: string | ((ctx: unknown) => string);
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    credentials?: boolean;
    maxAge?: number | string;
  }

  export default function cors(options?: CorsOptions): Middleware;
}

declare module 'sql.js' {
  export interface QueryResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Statement {
    bind(values?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export class Database {
    constructor(data?: BufferSource);
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): QueryResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(config?: unknown): Promise<SqlJsStatic>;
}
