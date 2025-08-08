export enum FieldTypes {
  Email = "EMAIL", // Email address string ********************** ✅
  Text = "TEXT", // Short or long string ************************ ✅
  Int = "INT", // Integer number ******************************** ✅
  Float = "FLOAT", // Decimal number **************************** ✅
  Boolean = "BOOLEAN", // true/false **************************** ✅
  Array = "ARRAY", // List of values **************************** ✅
  Json = "JSON", // Nested object/array ************************* ✅
  Date = "DATE", // ISO date string (YYYY-MM-DD) **************** ✅
  DateTime = "DATETIME", // Full timestamp (ISO 8601) *********** ✅
  UUID = "UUID", // Unique identifier *************************** ✅
  Password = "PASSWORD", // Hashed password ********************* ✅
}

// Type-level helpers for IntelliSense
import type { FieldObject } from "./schema";

export type ColumnType<T> = T extends FieldObject<infer V, any, any>
  ? V
  : never;

type RequiredKeys<TColumns> = {
  [K in keyof TColumns]-?: TColumns[K] extends FieldObject<
    any,
    infer TNotNull,
    infer THasDefault
  >
    ? TNotNull extends false
      ? never
      : THasDefault extends true
        ? never
        : K
    : never;
}[keyof TColumns];

type OptionalKeys<TColumns> = Exclude<keyof TColumns, RequiredKeys<TColumns>>;

type ColumnValue<T> = T extends FieldObject<infer V, infer TNotNull, any>
  ? TNotNull extends false
    ? V | null
    : V
  : never;

export type RowFromColumns<TColumns> = {
  [K in RequiredKeys<TColumns>]: ColumnValue<TColumns[K]>;
} & {
  [K in OptionalKeys<TColumns>]?: ColumnValue<TColumns[K]>;
};

export interface DatabaseSchema {
  Tables: Record<string, TableSchema>;
}

export interface TableSchema {
  [columnName: string]: FieldSchema;
}

export interface FieldSchema {
  Type: FieldTypes;
  NotNull?: boolean;
  Default?: any;
  Enum?: any[];
  Reference?: ReferenceSchema;
}

export interface ReferenceSchema {
  Table: string;
  Field: string;
  Type: "MANY" | "ONE";
}

export interface DatabaseConfig {
  path: string;
  flushInterval?: number;
}

export interface QueryOptions<TRow = any> {
  Columns?: (keyof TRow)[];
  Limit?: number;
  Offset?: number;
  Unique?: boolean;
  OrderBy?: {
    Column: keyof TRow & string;
    Direction: "ASC" | "DESC";
  };
  Matches?: Partial<TRow>;
  Extend?: string[];
}

export interface UpdateOptions<TRow = any> {
  Matches?: Partial<TRow>;
  Values: Partial<TRow>;
  Limit?: number;
  Offset?: number;
}

export interface DeleteOptions<TRow = any> {
  Matches?: Partial<TRow>;
  Limit?: number;
  Offset?: number;
}

export type InsertValues<TRow> = TRow;