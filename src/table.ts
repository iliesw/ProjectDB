import { FieldTypes } from "./types";
import type { QueryOptions, UpdateOptions, DeleteOptions, RowFromColumns, InsertValues } from "./types";
import * as fs from "node:fs";
import * as pathModule from "node:path";
const fsp = fs.promises;

type SchemaField = {
  Type: FieldTypes;
  NotNull?: boolean;
  Default?: any;
  Enum?: any[];
  Reference?: { Table: string; Field: string; Type: string };
};
type SchemaType = Record<string, SchemaField>;
type TypeCheckerFn = (val: any) => boolean;

// Event system types
type Listener<T> = (payload: T) => void;

type TableEventMap<TRow> = {
  insert: { row: RowFromColumns<TRow>; index: number };
  update: {
    before: RowFromColumns<TRow>;
    after: RowFromColumns<TRow>;
    index: number;
    values: Partial<RowFromColumns<TRow>>;
  };
  delete: { row: RowFromColumns<TRow>; index: number };
  get: { options: QueryOptions<RowFromColumns<TRow>>; result: RowFromColumns<TRow>[] };
};

// Add interface for precalculated extend relationships
interface ExtendRelationship {
  myColumn: string;
  targetColumn: string;
  referenceType: string;
}

// Index interface for better query performance
interface TableIndex {
  [columnName: string]: Map<any, number[]>;
}

const TypeChecker: Record<string, TypeCheckerFn> = {
  [FieldTypes.Int]: (val: any) => Number.isInteger(val),
  [FieldTypes.Email]: (val: any) =>
    typeof val === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  [FieldTypes.Text]: (val: any) => typeof val === "string",
  [FieldTypes.Float]: (val: any) =>
    typeof val === "number" && !Number.isNaN(val),
  [FieldTypes.Json]: (val: any) => typeof val === "object" && val !== null,
  [FieldTypes.Boolean]: (val: any) => typeof val === "boolean",
  [FieldTypes.Date]: (val: any) =>
    typeof val === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(val) &&
    !isNaN(Date.parse(val)),
  [FieldTypes.DateTime]: (val: any) =>
    typeof val === "string" && !isNaN(Date.parse(val)),
  [FieldTypes.UUID]: (val: any) =>
    typeof val === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      val
    ),
  [FieldTypes.Password]: (val: any) =>
    typeof val === "string" && val.length > 0,
  [FieldTypes.Array]: (val: any) => Array.isArray(val),
};

const InsertChecker = (Values: Record<string, any>, Schema: SchemaType) => {
  const schemaKeys = Object.keys(Schema);
  const valueKeys = Object.keys(Values);
  const schemaKeySet = new Set<string>(schemaKeys);

  // Fast check for extra keys
  for (let i = 0; i < valueKeys.length; i++) {
    const key = valueKeys[i];
    if (typeof key !== "string" || !schemaKeySet.has(key)) return null;
  }

  const rowToInsert: Record<string, any> = {};

  // Fill values
  for (let i = 0; i < schemaKeys.length; i++) {
    const key = schemaKeys[i];
    const field = Schema[key];
    const hasProvidedValue = Object.prototype.hasOwnProperty.call(Values, key);
    if (hasProvidedValue) {
      rowToInsert[key] = Values[key];
    } else if (field && field.Default !== undefined) {
      rowToInsert[key] = field.Default;
    } else if (field && field.NotNull === false) {
      rowToInsert[key] = null;
    }
  }

  // Validate
  for (let i = 0; i < schemaKeys.length; i++) {
    const key = schemaKeys[i];
    const field = Schema[key];
    if (!field) return false;
    const { Type, NotNull, Enum: EnumValues } = field;
    const value = rowToInsert[key];

    if (value === undefined) {
      if (NotNull) return false;
      continue;
    }

    if (value === null) {
      if (NotNull) return false;
      continue;
    }

    const checker = TypeChecker[Type];
    if (checker && !checker(value)) return false;

    if (EnumValues && !EnumValues.includes(value)) return false;
  }

  return rowToInsert;
};

const UpdateChecker = (Values: Record<string, any>, Schema: SchemaType) => {
  const schemaKeySet = new Set<string>(Object.keys(Schema));
  const valueKeys = Object.keys(Values);

  for (let i = 0; i < valueKeys.length; i++) {
    const key = valueKeys[i];
    if (typeof key !== "string" || !schemaKeySet.has(key)) return null;

    const field = Schema[key];
    if (!field) return false;
    const value = Values[key];
    if (value === undefined) continue;
    if (value === null) {
      if (field.NotNull) return false;
      continue;
    }

    const checker = TypeChecker[field.Type];
    if (checker && !checker(value)) return false;

    if (field.Enum && !field.Enum.includes(value)) return false;
  }

  return Values;
};
export class OptimaTable<TColumns = any> {
  Data: RowFromColumns<TColumns>[] = [];
  _Name: string;
  _Path: string;
  _Schema: any;
  _TablesRef?: { [key: string]: OptimaTable };
  // Add precalculated extend relationships
  _extendRelationships: Map<string, ExtendRelationship> = new Map();
  // Add indexing for better performance
  private _indexes: TableIndex = {};
  private _indexDirty: Set<string> = new Set();
  // Event listeners registry
  private _listeners: Map<string, Set<Listener<any>>> = new Map();

  private _dirty: boolean = false;
  private _changeCount: number = 0;
  private _changeThreshold: number = 100; // customizable
  private _timeThresholdMs: number = 5000; // save if this much time elapsed since last save
  private _lastSaveTime: number = Date.now();
  private _lastChangeTime: number = 0;
  private _pendingSaveTimer: any | null = null;

  constructor(name: string, path: string) {
    this._Name = name;
    this._Path = path;
    // Register a safe flush on process exit without using intervals
    const flush = () => {
      try {
        if (this._dirty) {
          this.SaveSync();
        }
      } catch (_) {
        // best-effort on shutdown
      }
    };
    // Use once for beforeExit and process signals
    // These registrations are idempotent per instance lifetime
    // and do not rely on any interval timers
    // @ts-ignore Node/Bun environments expose process events
    if (typeof process !== "undefined" && process && process.on) {
      // beforeExit can run multiple times; keep minimal logic
      process.once("beforeExit", flush);
      process.once("exit", flush);
      process.once("SIGINT", () => {
        flush();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        flush();
        process.exit(0);
      });
    }
  }

  private markDirty() {
    this._dirty = true;
    this._changeCount++;
    this._lastChangeTime = Date.now();
    this.scheduleTimeBasedSave();
  }

  // --- Events API ---
  on<E extends keyof TableEventMap<TColumns> | (string & {})>(
    event: E,
    listener: Listener<E extends keyof TableEventMap<TColumns>
      ? TableEventMap<TColumns>[E]
      : any>
  ): this {
    const eventName = String(event);
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
    this._listeners.get(eventName)!.add(listener as Listener<any>);
    return this;
  }

  once<E extends keyof TableEventMap<TColumns> | (string & {})>(
    event: E,
    listener: Listener<E extends keyof TableEventMap<TColumns>
      ? TableEventMap<TColumns>[E]
      : any>
  ): this {
    const eventName = String(event);
    const onceWrapper = (payload: any) => {
      try {
        (listener as Listener<any>)(payload);
      } finally {
        this.off(eventName, onceWrapper);
      }
    };
    return this.on(eventName, onceWrapper);
  }

  off<E extends keyof TableEventMap<TColumns> | (string & {})>(
    event: E,
    listener?: Listener<E extends keyof TableEventMap<TColumns>
      ? TableEventMap<TColumns>[E]
      : any>
  ): this {
    const eventName = String(event);
    if (!this._listeners.has(eventName)) return this;
    if (!listener) {
      this._listeners.delete(eventName);
      return this;
    }
    this._listeners.get(eventName)!.delete(listener as Listener<any>);
    if (this._listeners.get(eventName)!.size === 0) {
      this._listeners.delete(eventName);
    }
    return this;
  }

  emit<E extends keyof TableEventMap<TColumns> | (string & {})>(
    event: E,
    payload: E extends keyof TableEventMap<TColumns>
      ? TableEventMap<TColumns>[E]
      : any
  ): void {
    const eventName = String(event);
    const listeners = this._listeners.get(eventName);
    if (!listeners || listeners.size === 0) return;
    // Call listeners safely; a throw in a listener should not break the DB flow
    for (const listener of Array.from(listeners)) {
      try {
        (listener as Listener<any>)(payload);
      } catch (_) {
        // swallow listener errors to keep core ops stable
      }
    }
  }
  
  // Smart save: called after data-changing operations to persist based on thresholds
  private async checkAutoSave(force: boolean = false): Promise<void> {
    if (!this._dirty && !force) return;
    const now = Date.now();
    const countReached = this._changeCount >= this._changeThreshold;
    const timeReached = now - this._lastSaveTime >= this._timeThresholdMs;
    if (force || countReached || timeReached) {
      await this.Save();
    }
  }

  // Schedule a one-shot timer capped by time-threshold since last save
  private scheduleTimeBasedSave(): void {
    if (!this._dirty) return;
    if (this._pendingSaveTimer) return;
    const now = Date.now();
    const elapsedSinceLastSave = now - this._lastSaveTime;
    const delay = Math.max(0, this._timeThresholdMs - elapsedSinceLastSave);
    this._pendingSaveTimer = setTimeout(() => {
      this._pendingSaveTimer = null;
      // Force to ensure it saves even if count is small
      void this.checkAutoSave(true);
    }, delay);
  }
  // Add method to precalculate extend relationships
  private precalculateExtendRelationships(DBSchema: any): void {
    this._extendRelationships.clear();
    for (const table of Object.keys(DBSchema.Tables)) {
      if (table === this._Name) continue;
      const TableFields = Object.keys(DBSchema.Tables[table]);
      TableFields.forEach((elem) => {
        if (
          DBSchema.Tables[table][elem].Reference &&
          DBSchema.Tables[table][elem].Reference.Table == this._Name
        ) {
          const relationship: ExtendRelationship = {
            myColumn: DBSchema.Tables[table][elem].Reference.Field,
            targetColumn: elem,
            referenceType: DBSchema.Tables[table][elem].Reference.Type || "ONE",
          };
          this._extendRelationships.set(table, relationship);
        }
      });
    }
  }

  // Build indexes for better query performance
  private buildIndexes(): void {
    this._indexes = {};
    this._indexDirty.clear();

    if (!this._Schema) return;

    const schemaKeys = Object.keys(this._Schema);

    // Create indexes for all columns
    for (const column of schemaKeys) {
      this._indexes[column] = new Map();
    }

    // Populate indexes
    for (let i = 0; i < this.Data.length; i++) {
      const row = this.Data[i];
      for (const column of schemaKeys) {
        const value = row[column];
        if (this._indexes[column]) {
          if (!this._indexes[column].has(value)) {
            this._indexes[column].set(value, []);
          }
          const indices = this._indexes[column].get(value);
          if (indices) {
            indices.push(i);
          }
        }
      }
    }
  }

  // Get rows by indexed column value
  private getByIndex(column: string, value: any): number[] {
    if (!this._indexes[column]) {
      return [];
    }
    return this._indexes[column].get(value) || [];
  }

  // Update indexes when data changes
  private updateIndexForColumn(
    operation: "insert" | "update" | "delete",
    column: string,
    rowIndex: number,
    oldValue?: any,
    newValue?: any
  ): void {
    if (!this._Schema) return;
    if (!this._indexes[column]) return;

    if (operation === "insert") {
      const value = this.Data[rowIndex]?.[column];
      if (value !== undefined) {
        if (!this._indexes[column].has(value)) {
          this._indexes[column].set(value, []);
        }
        const indices = this._indexes[column].get(value);
        if (indices) {
          indices.push(rowIndex);
        }
      }
    } else if (operation === "update") {
      if (oldValue !== undefined) {
        const oldIndices = this._indexes[column].get(oldValue);
        if (oldIndices) {
          const idx = oldIndices.indexOf(rowIndex);
          if (idx > -1) oldIndices.splice(idx, 1);
        }
      }
      if (newValue !== undefined) {
        if (!this._indexes[column].has(newValue)) {
          this._indexes[column].set(newValue, []);
        }
        const indices = this._indexes[column].get(newValue);
        if (indices) {
          indices.push(rowIndex);
        }
      }
    } else if (operation === "delete") {
      const value = oldValue;
      const indices = this._indexes[column].get(value);
      if (indices) {
        const idx = indices.indexOf(rowIndex);
        if (idx > -1) indices.splice(idx, 1);
      }
    }

    this.markDirty();
  }

  Load = async (DBSchema: string) => {
    try {
      const tablesDir = pathModule.join(this._Path, "Tables");
      const tableFilePath = pathModule.join(tablesDir, `${this._Name}.json`);

      try {
        await fsp.mkdir(tablesDir, { recursive: true });
        const raw = await fsp.readFile(tableFilePath, "utf8");
        const data = JSON.parse(raw);
        this.Data = Array.isArray(data) ? data : [];
      } catch (readErr: any) {
        // If file does not exist or is corrupted, reset and save
        this.Data = [];
        await this.Save();
      }

      // Precalculate extend relationships after loading data
      this.precalculateExtendRelationships(DBSchema);
      // Build indexes after loading data
      this.buildIndexes();
    } catch (error) {
      // If file is corrupted, start with empty array and recreate it
      this.Data = [];
      await this.Save();
      this.precalculateExtendRelationships(DBSchema);
      this.buildIndexes();
    }
  };

  LoadSync(DBSchema: any): void {
    try {
      const tablesDir = pathModule.join(this._Path, "Tables");
      if (!fs.existsSync(tablesDir)) {
        fs.mkdirSync(tablesDir, { recursive: true });
      }
      const tableFilePath = pathModule.join(tablesDir, `${this._Name}.json`);

      if (fs.existsSync(tableFilePath)) {
        const raw = fs.readFileSync(tableFilePath, "utf8");
        const data = JSON.parse(raw);
        this.Data = Array.isArray(data) ? data : [];
      } else {
        this.Data = [];
        this.SaveSync();
      }

      this.precalculateExtendRelationships(DBSchema);
      this.buildIndexes();
    } catch (_error) {
      this.Data = [];
      this.SaveSync();
      this.precalculateExtendRelationships(DBSchema);
      this.buildIndexes();
    }
  };

  Save = async () => {
    try {
      const tablesDir = pathModule.join(this._Path, "Tables");
      const tableFilePath = pathModule.join(tablesDir, `${this._Name}.json`);
      await fsp.mkdir(tablesDir, { recursive: true });
      await fsp.writeFile(tableFilePath, JSON.stringify(this.Data));
      this._dirty = false;
      this._changeCount = 0;
      this._lastSaveTime = Date.now();
      if (this._pendingSaveTimer) {
        clearTimeout(this._pendingSaveTimer);
        this._pendingSaveTimer = null;
      }
    } catch (error) {
      throw new Error(
        `Failed to save table '${this._Name}': ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  SaveSync(): void {
    try {
      const tablesDir = pathModule.join(this._Path, "Tables");
      if (!fs.existsSync(tablesDir)) {
        fs.mkdirSync(tablesDir, { recursive: true });
      }
      const tableFilePath = pathModule.join(tablesDir, `${this._Name}.json`);
      fs.writeFileSync(tableFilePath, JSON.stringify(this.Data));
      this._dirty = false;
      this._changeCount = 0;
      this._lastSaveTime = Date.now();
      if (this._pendingSaveTimer) {
        clearTimeout(this._pendingSaveTimer);
        this._pendingSaveTimer = null;
      }
    } catch (error) {
      throw new Error(
        `Failed to save table '${this._Name}': ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  Get = (options: QueryOptions<RowFromColumns<TColumns>> = {}): RowFromColumns<TColumns>[] => {
    const { Columns, Limit, Offset, Unique, OrderBy, Matches, Extend } =
      options;

    let result = Array.isArray(this.Data) ? [...this.Data] : [];

    // Use indexes for filtering if possible
    if (Matches && typeof Matches === "object") {
      const matchEntries = Object.entries(Matches);

      // If we have a single match condition, try to use index
      if (matchEntries.length === 1) {
        const entry = matchEntries[0];
        if (entry) {
          const [key, value] = entry;
          if (this._indexes[key]) {
            const indices = this.getByIndex(key, value);
            result = indices.map((index) => this.Data[index]);
          } else {
            // Fallback to linear search
            result = result.filter((row) => row[key] === value);
          }
        }
      } else {
        // Multiple conditions, use linear search
        result = result.filter((row) =>
          matchEntries.every((entry) => {
            const [key, value] = entry;
            return row[key] === value;
          })
        );
      }
    }

    // Select only specified columns if provided
    if (Columns && Columns.length > 0) {
      result = result.map((row) => {
        const filtered: any = {};
        Columns.forEach((col) => {
          filtered[col] = row[col];
        });
        return filtered;
      });
    }

    // Remove duplicates if Unique is true
    if (Unique) {
      const seen = new Set<string>();
      result = result.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Order by column if provided
    if (OrderBy && OrderBy.Column) {
      result.sort((a, b) => {
        const col = OrderBy.Column;
        if (a[col] < b[col]) return OrderBy.Direction === "ASC" ? -1 : 1;
        if (a[col] > b[col]) return OrderBy.Direction === "ASC" ? 1 : -1;
        return 0;
      });
    }

    // Extend
    Extend?.forEach((table) => {
      const RelationDetail = this._extendRelationships.get(table);
      if (!RelationDetail) throw new Error("Extend Error : Relation Undefined");

      const joinedTable = this._TablesRef?.[table]?.Get(); // Fetch once
      if (!joinedTable) {
        return;
      }
      const joinMap = new Map();

      for (const row of joinedTable) {
        const key = row[RelationDetail.targetColumn];
        if (RelationDetail.referenceType === "ONE") {
          joinMap.set(key, row); // One-to-one
        } else {
          if (!joinMap.has(key)) joinMap.set(key, []);
          joinMap.get(key).push(row); // One-to-many
        }
      }

      result = result.map((old) => {
        const key = old[RelationDetail.myColumn];
        const DataToAttach = joinMap.get(key) ?? null;
        return { ...old, ["$" + table]: DataToAttach };
      });
    });

    // Handle Offset and Limit safely
    const safeOffset = typeof Offset === "number" && Offset >= 0 ? Offset : 0;
    let safeLimit: number | undefined = undefined;
    if (typeof Limit === "number" && Limit > 0) {
      safeLimit = safeOffset + Limit;
    }

    const out = result.slice(safeOffset, safeLimit);

    // Emit get event
    this.emit("get", { options: options as any, result: out as any });

    return out;
  };

  Insert = async (Values: InsertValues<RowFromColumns<TColumns>>, Options?: {}): Promise<RowFromColumns<TColumns>> => {
    const RowToInsert = InsertChecker(Values as Record<string, any>, this._Schema) as unknown as RowFromColumns<TColumns> | null | false;
    if (RowToInsert) {
      const insertIndex = this.Data.length;
      this.Data.push(RowToInsert);
      // update indexes per column
      for (const column of Object.keys(this._Schema || {})) {
        this.updateIndexForColumn("insert", column, insertIndex);
      }
      // Emit insert event
      this.emit("insert", { row: RowToInsert as any, index: insertIndex });
      await this.checkAutoSave();
      return RowToInsert;
    } else {
      throw new Error("Insert failed: Values do not match table schema.");
    }
  };

  Delete = async (options: DeleteOptions<RowFromColumns<TColumns>> = {}): Promise<number> => {
    const { Matches, Limit, Offset } = options;

    let itemsToDelete = [...this.Data];

    // Filter by condition if provided
    if (Matches && typeof Matches === "object") {
      // Validate that all keys in Matches exist in the schema
      const schemaKeys = Object.keys(this._Schema || {});
      const matchKeys = Object.keys(Matches);

      for (const key of matchKeys) {
        if (!schemaKeys.includes(key)) {
          throw new Error(
            `Delete failed: Key '${key}' does not exist in table schema.`
          );
        }
      }

      itemsToDelete = itemsToDelete.filter((row) =>
        Object.entries(Matches).every(([key, value]) => row[key] === value)
      );
    }

    // Handle Offset and Limit safely
    const safeOffset = typeof Offset === "number" && Offset >= 0 ? Offset : 0;
    let safeLimit: number | undefined = undefined;
    if (typeof Limit === "number" && Limit > 0) {
      safeLimit = safeOffset + Limit;
    }

    itemsToDelete = itemsToDelete.slice(safeOffset, safeLimit);

    // Remove the filtered items from the original data and update indexes
    const deletedCount = itemsToDelete.length;
    for (const item of itemsToDelete) {
      const index = this.Data.indexOf(item);
      if (index !== -1) {
        // Update indexes before removing per column
        for (const column of Object.keys(this._Schema || {})) {
          this.updateIndexForColumn("delete", column, index, item[column]);
        }
        this.Data.splice(index, 1);
        // Emit delete event
        this.emit("delete", { row: item as any, index });
      }
    }

    // Smart save based on thresholds
    await this.checkAutoSave();

    return deletedCount;
  };

  Update = async (options: UpdateOptions<RowFromColumns<TColumns>>): Promise<number> => {
    const { Matches, Values, Limit, Offset } = options;

    // Validate that all keys in Matches exist in the schema
    if (Matches && typeof Matches === "object") {
      const schemaKeys = Object.keys(this._Schema || {});
      const matchKeys = Object.keys(Matches);

      for (const key of matchKeys) {
        if (!schemaKeys.includes(key)) {
          throw new Error(
            `Update failed: Match key '${key}' does not exist in table schema.`
          );
        }
      }
    }

    // Validate that all keys in Values exist in the schema
    const schemaKeys = Object.keys(this._Schema || {});
    const valueKeys = Object.keys(Values);

    for (const key of valueKeys) {
      if (!schemaKeys.includes(key)) {
        throw new Error(
          `Update failed: Value key '${key}' does not exist in table schema.`
        );
      }
    }

    // Validate the update values against schema
    const validatedValues = UpdateChecker(Values, this._Schema);
    if (!validatedValues) {
      throw new Error("Update failed: Values do not match table schema.");
    }

    let itemsToUpdate = [...this.Data];

    // Filter by condition if provided
    if (Matches && typeof Matches === "object") {
      itemsToUpdate = itemsToUpdate.filter((row) =>
        Object.entries(Matches).every(([key, value]) => row[key] === value)
      );
    }

    // Handle Offset and Limit safely
    const safeOffset = typeof Offset === "number" && Offset >= 0 ? Offset : 0;
    let safeLimit: number | undefined = undefined;
    if (typeof Limit === "number" && Limit > 0) {
      safeLimit = safeOffset + Limit;
    }

    itemsToUpdate = itemsToUpdate.slice(safeOffset, safeLimit);

    // Update the filtered items
    let updatedCount = 0;
    for (const item of itemsToUpdate) {
      // Find the index of the item in the original data
      const index = this.Data.indexOf(item);
      if (index !== -1) {
        const beforeSnapshot = { ...(this.Data[index] as any) } as RowFromColumns<TColumns>;
        // Update indexes for changed values per column
        for (const entry of Object.entries(validatedValues)) {
          const [key, newValue] = entry as [string, any];
          const oldValue = this.Data[index][key];
          if (oldValue !== newValue) {
            this.updateIndexForColumn("update", key, index, oldValue, newValue);
          }
        }

        // Update the item with new values
        Object.assign(this.Data[index], validatedValues);
        // Emit update event
        this.emit("update", {
          before: beforeSnapshot as any,
          after: this.Data[index] as any,
          index,
          values: validatedValues as any,
        });
        updatedCount++;
      }
    }

    // Smart save based on thresholds
    await this.checkAutoSave();

    return updatedCount;
  };
}