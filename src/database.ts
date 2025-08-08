import { OptimaTable } from "./table";
import { FieldTypes } from "./types";
import type { DatabaseSchema } from "./types";
import * as fs from "node:fs";
import * as pathModule from "node:path";

export { FieldTypes };

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class Database<TTables extends Record<string, any> = Record<string, any>> {
  private static _defaultFlushInterval: number = 10000; // 10 seconds
  public path: string;
  public schema: DatabaseSchema | null = null;
  public Tables: { [K in keyof TTables]: OptimaTable<TTables[K]> } =
    {} as any;

  /**
   * Create a database instance at the specified path (synchronous)
   * and initialize schema/tables.
   */
  constructor(path: string, Tables: TTables) {
    if (!path || typeof path !== "string") {
      throw new DatabaseError(
        "Database path must be a non-empty string",
        "INVALID_PATH"
      );
    }
    const normalizedPath = Database.normalizePath(path);
    this.path = normalizedPath;
    try {
      Database.ensureDirectories(this.path);
      const schemaFile = pathModule.join(this.path, "Schema.json");
      fs.writeFileSync(schemaFile, JSON.stringify({ Tables: Tables }));
      this.loadSchemaSync();
      this.loadTablesSync();
      // Wire table references for joins
      Object.values(this.Tables as any).forEach((t: OptimaTable) => {
        // @ts-ignore - internal wiring
        t._TablesRef = this.Tables;
      });
    } catch (error) {
      throw new DatabaseError(
        `Migration failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "MIGRATION_FAILED"
      );
    }
  }

  Sync(Tables: TTables): void {
    try {
      Database.ensureDirectories(this.path);
      const schemaFile = pathModule.join(this.path, "Schema.json");
      fs.writeFileSync(schemaFile, JSON.stringify({ Tables: Tables }));
      this.loadSchemaSync();
      this.loadTablesSync();
      Object.values(this.Tables as any).forEach((t: OptimaTable) => {
        // @ts-ignore - internal wiring
        t._TablesRef = this.Tables;
      });
    } catch (error) {
      throw new DatabaseError(
        `Migration failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "MIGRATION_FAILED"
      );
    }
  }

  private static normalizePath(path: string): string {
    return path.replace(/[\\/]+/g, "/").replace(/\/$/, "");
  }

  private loadSchemaSync(): void {
    const CheckSchema = (Json: any): Json is DatabaseSchema => {
      if (!Json || typeof Json !== "object") {
        return false;
      }

      if (!Json.Tables || typeof Json.Tables !== "object") {
        return false;
      }

      const Tables = Object.keys(Json.Tables);
      for (const table of Tables) {
        if (typeof table !== "string" || table.trim() === "") {
          return false;
        }

        const Columns = Object.keys(Json.Tables[table]);
        for (const column of Columns) {
          if (typeof column !== "string" || column.trim() === "") {
            return false;
          }

          const field = Json.Tables[table][column];
          if (
            !field ||
            !field.Type ||
            !Object.values(FieldTypes).includes(field.Type)
          ) {
            return false;
          }

          // Validate reference if present
          if (field.Reference) {
            if (
              typeof field.Reference !== "object" ||
              typeof field.Reference.Table !== "string" ||
              typeof field.Reference.Field !== "string" ||
              !["MANY", "ONE"].includes(field.Reference.Type)
            ) {
              return false;
            }
          }
        }
      }
      return true;
    };

    try {
      const schemaPath = pathModule.join(this.path, "Schema.json");
      if (!fs.existsSync(schemaPath)) {
        throw new DatabaseError(
          "Schema file does not exist",
          "SCHEMA_NOT_FOUND"
        );
      }

      const raw = fs.readFileSync(schemaPath, "utf8");
      const JsonData = JSON.parse(raw);
      if (CheckSchema(JsonData)) {
        this.schema = JsonData;
      } else {
        throw new DatabaseError("Invalid schema format", "INVALID_SCHEMA");
      }
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to load schema: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "SCHEMA_LOAD_ERROR"
      );
    }
  }

  private loadTablesSync(): void {
    if (!this.schema || !this.schema.Tables) {
      throw new DatabaseError(
        "Schema not loaded or invalid",
        "INVALID_SCHEMA_STATE"
      );
    }

    const STables = Object.keys(this.schema.Tables);
    for (const table of STables) {
      try {
        const tableInstance = new OptimaTable<any>(table, this.path);
        tableInstance._Schema = this.schema.Tables[table];
        tableInstance.LoadSync(this.schema as any);
        (this.Tables as any)[table] = tableInstance as OptimaTable<any>;
      } catch (error) {
        throw new DatabaseError(
          `Failed to load table '${table}': ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "TABLE_LOAD_ERROR"
        );
      }
    }
  }

  static get _FlushInterval(): number {
    return this._defaultFlushInterval;
  }

  static set _FlushInterval(value: number) {
    if (typeof value !== "number" || value < 0) {
      throw new DatabaseError(
        "Flush interval must be a positive number",
        "INVALID_FLUSH_INTERVAL"
      );
    }
    this._defaultFlushInterval = value;
  }

  private static ensureDirectories(rootPath: string): void {
    try {
      if (!fs.existsSync(rootPath)) {
        fs.mkdirSync(rootPath, { recursive: true });
      }
      const tablesDir = pathModule.join(rootPath, "Tables");
      if (!fs.existsSync(tablesDir)) {
        fs.mkdirSync(tablesDir, { recursive: true });
      }
    } catch (error) {
      throw new DatabaseError(
        `Failed to ensure directories: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "DIR_INIT_ERROR"
      );
    }
  }
}
