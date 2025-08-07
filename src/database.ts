import { OptimaTable } from "./table";
import { FieldTypes } from "./types";
import type { DatabaseSchema } from "./types";
import * as fs from "node:fs";
import * as pathModule from "node:path";

export { FieldTypes };

interface DatabaseInstance {
  path: string;
  schema: DatabaseSchema | null;
  Tables: { [key: string]: OptimaTable };
  Sync: (Tables: any) => void;
}

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class Database {
  private static _instance: DatabaseInstance | null = null;
  private static _defaultFlushInterval: number = 10000; // 10 seconds

  constructor() {
    throw new Error(
      "Database class cannot be instantiated. Use Database.Connect() instead."
    );
  }

  /**
   * Connect to a database at the specified path (synchronous)
   * @param path Database path
   * @returns DatabaseInstance
   */
  static Connect(path: string, Tables: any): DatabaseInstance {
    if (!path || typeof path !== "string") {
      throw new DatabaseError(
        "Database path must be a non-empty string",
        "INVALID_PATH"
      );
    }

    const normalizedPath = this.normalizePath(path);

    // Return existing instance if already connected
    if (this._instance) {
      return this._instance;
    }

    // Create new instance
    const instance: DatabaseInstance = {
      path: normalizedPath,
      schema: null,
      Tables: {},
      Sync: function (Tables: any): void {
        try {
          Database.ensureDirectories(instance.path);
          const schemaFile = pathModule.join(instance.path, "Schema.json");
          fs.writeFileSync(schemaFile, JSON.stringify({ Tables: Tables }));
          Database.loadSchemaSync(instance);
          Database.loadTablesSync(instance);
        } catch (error) {
          throw new DatabaseError(
            `Migration failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            "MIGRATION_FAILED"
          );
        }
      },
    };
    try {
      Database.ensureDirectories(normalizedPath);
      const schemaFile = pathModule.join(normalizedPath, "Schema.json");
      fs.writeFileSync(schemaFile, JSON.stringify({ Tables: Tables }));
      Database.loadSchemaSync(instance);
      Database.loadTablesSync(instance);
    } catch (error) {
      throw new DatabaseError(
        `Migration failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "MIGRATION_FAILED"
      );
    }
    this._instance = instance;
    return instance;
  }

  static Close():void {

  }

  private static normalizePath(path: string): string {
    return path.replace(/[\\/]+/g, "/").replace(/\/$/, "");
  }

  private static loadSchemaSync(instance: DatabaseInstance): void {
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
      const schemaPath = pathModule.join(instance.path, "Schema.json");
      if (!fs.existsSync(schemaPath)) {
        throw new DatabaseError(
          "Schema file does not exist",
          "SCHEMA_NOT_FOUND"
        );
      }

      const raw = fs.readFileSync(schemaPath, "utf8");
      const JsonData = JSON.parse(raw);
      if (CheckSchema(JsonData)) {
        instance.schema = JsonData;
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

  private static loadTablesSync(instance: DatabaseInstance): void {
    if (!instance.schema || !instance.schema.Tables) {
      throw new DatabaseError(
        "Schema not loaded or invalid",
        "INVALID_SCHEMA_STATE"
      );
    }

    const STables = Object.keys(instance.schema.Tables);
    for (const table of STables) {
      try {
        const tableInstance = new OptimaTable(table, instance.path);
        tableInstance._Schema = instance.schema.Tables[table];
        tableInstance.LoadSync(instance.schema as any);
        instance.Tables[table] = tableInstance;
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

  // Legacy static methods for backward compatibility
  static get _Path(): string {
    return this._instance ? this._instance.path : "";
  }

  static get _Schema(): DatabaseSchema | null {
    return this._instance ? this._instance.schema : null;
  }

  static get Tables(): { [key: string]: OptimaTable } {
    return this._instance ? this._instance.Tables : {};
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

  static get _InstanceID(): number {
    return -1; // Legacy compatibility
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
