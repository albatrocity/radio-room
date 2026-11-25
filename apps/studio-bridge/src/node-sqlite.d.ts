/**
 * Minimal types for Node's experimental `node:sqlite` (ADR 0230).
 * Installed `@types/node` may omit `DatabaseSync`.
 */
declare module "node:sqlite" {
  export type StatementResultingChanges = {
    changes: number
    lastInsertRowid: number | bigint
  }

  export type StatementSync = {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): StatementResultingChanges
  }

  export type DatabaseSyncOptions = {
    readOnly?: boolean
    allowExtension?: boolean
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions)
    close(): void
    prepare(sql: string): StatementSync
    exec(sql: string): void
  }
}
