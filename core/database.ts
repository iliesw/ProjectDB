import { Table } from "./table";
import { FieldTypes } from "./types";

export { FieldTypes };

interface DatabaseInstance {
  path: string;
  schema: any;
  Tables: { [key: string]: Table };
  Migrate: (Tables: any) => Promise<void>;
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
   * Connect to a database at the specified path
   * @param path Database path
   * @returns Promise<DatabaseInstance>
   */
  static async Connect(path: string): Promise<DatabaseInstance> {
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
      Migrate: async function (Tables: any): Promise<void> {
        await Bun.file(this.path + "/Schema.json").write(
          JSON.stringify({ Tables: Tables }, null, 2)
        );
        await Database.loadSchema(instance);
        await Database.loadTables(instance);
      },
    };

    // Load schema and tables
    await this.loadSchema(instance);
    await this.loadTables(instance);

    this._instance = instance;

    return instance;
  }

  private static normalizePath(path: string): string {
    // Normalize path to prevent issues with different path separators
    return path.replace(/[\\/]+/g, "/").replace(/\/$/, "");
  }

  private static async loadSchema(instance: DatabaseInstance): Promise<void> {
    const CheckSchema = (Json: any): boolean => {
      if (!Json || !Json.Tables || typeof Json.Tables !== "object") {
        return false;
      }

      const Tables = Object.keys(Json.Tables);
      for (const table of Tables) {
        const Columns = Object.keys(Json.Tables[table]);
        for (const column of Columns) {
          const field = Json.Tables[table][column];
          if (
            !field ||
            !field.Type ||
            !Object.values(FieldTypes).includes(field.Type)
          ) {
            return false;
          }
        }
      }
      return true;
    };

    try {
      const SchemaFile = Bun.file(instance.path + "/Schema.json");
      if (!(await SchemaFile.exists())) {
        throw new Error("Schema file does not exist");
      }

      const JsonData = await SchemaFile.json();
      if (CheckSchema(JsonData)) {
        instance.schema = JsonData;
      } else {
        throw new Error("Invalid Schema File");
      }
    } catch (error) {
      throw new Error(
        `Failed to load schema: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private static async loadTables(instance: DatabaseInstance): Promise<void> {
    if (!instance.schema || !instance.schema.Tables) {
      throw new Error("Schema not loaded or invalid");
    }

    const STables = Object.keys(instance.schema.Tables);
    for (const table of STables) {
      try {
        const tableInstance = new Table(table, instance.path);
        tableInstance._Schema = instance.schema.Tables[table];
        await tableInstance.Load(instance.schema);
        instance.Tables[table] = tableInstance;
      } catch (error) {
        throw new Error(
          `Table Data Does Not Exist for table '${table}': ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  }

  // Legacy static methods for backward compatibility
  static get _Path(): string {
    return this._instance ? this._instance.path : "";
  }

  static get _Schema(): any {
    return this._instance ? this._instance.schema : null;
  }

  static get Tables(): { [key: string]: Table } {
    return this._instance ? this._instance.Tables : {};
  }

  static get _FlushInterval(): number {
    return this._defaultFlushInterval;
  }

  static set _FlushInterval(value: number) {
    this._defaultFlushInterval = value;
  }

  static get _InstanceID(): number {
    return -1; // Legacy compatibility
  }
}
