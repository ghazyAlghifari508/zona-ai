declare module 'bun:sqlite' {
  export interface SqliteDatabase {
    query(sql: string): { all(...parameters: unknown[]): unknown[] }
    close(): void
  }

  export const Database: new (
    path: string,
    options?: { readonly?: boolean; fileMustExist?: boolean },
  ) => SqliteDatabase
}
