/*
 * Minimal typings for the `node:sqlite` builtin (Node >= 22.13). The installed
 * @types/node (20.x) predates it; this covers only what src/lib/auth uses.
 */
declare module "node:sqlite" {
  type SQLInputValue = null | number | bigint | string | Uint8Array;
  type SQLOutputValue = null | number | bigint | string | Uint8Array;

  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    all(...params: SQLInputValue[]): Array<Record<string, SQLOutputValue>>;
    get(...params: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    run(...params: SQLInputValue[]): StatementResultingChanges;
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
