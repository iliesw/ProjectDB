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

export interface QueryOptions {
  Columns?: string[];
  Limit?: number;
  Offset?: number;
  Unique?: boolean;
  OrderBy?: {
    Column: string;
    Direction: "ASC" | "DESC";
  };
  Matches?: Record<string, any>;
  Extend?: string[];
}

export interface UpdateOptions {
  Matches?: Record<string, any>;
  Values: Record<string, any>;
  Limit?: number;
  Offset?: number;
}

export interface DeleteOptions {
  Matches?: Record<string, any>;
  Limit?: number;
  Offset?: number;
} 