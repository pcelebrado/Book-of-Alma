declare module 'better-sqlite3' {
  export default class Database {
    constructor(path: string, options?: Record<string, unknown>);
    prepare(sql: string): {
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
      run: (...args: unknown[]) => { changes: number };
    };
    pragma(sql: string): void;
    exec(sql: string): void;
    close(): void;
  }
}
