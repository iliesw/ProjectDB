import { FieldTypes } from "./types";
import type { QueryOptions, UpdateOptions, DeleteOptions } from "./types";
import { Database } from "./database";
import * as fs from "node:fs";
import * as path from "node:path";

type SchemaField = {
  Type: FieldTypes;
  NotNull: boolean;
  Enum?: any[];
  Reference?: { Table: string; Field: string; Type: string };
};
type SchemaType = Record<string, SchemaField>;
type TypeCheckerFn = (val: any) => boolean;

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
    // @ts-ignore
    const field = Schema[key];
    // @ts-ignore
    if (Object.prototype.hasOwnProperty.call(Values, key)) {
    // @ts-ignore
      rowToInsert[key] = Values[key];
    } else if (field && field.NotNull === false) {
    // @ts-ignore
      rowToInsert[key] = null;
    }
  }

  // Validate
  for (let i = 0; i < schemaKeys.length; i++) {
    const key = schemaKeys[i];
    // @ts-ignore
    const field = Schema[key];
    if (!field) return false;
    const { Type, NotNull, Enum: EnumValues } = field;
    // @ts-ignore
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
    if (value == null) continue; // skip undefined/null

    const checker = TypeChecker[field.Type];
    if (checker && !checker(value)) return false;

    if (field.Enum && !field.Enum.includes(value)) return false;
  }

  return Values;
};
export class OptimaTable {
  Data: any[] = [];
  _Name: string;
  _Path: string;
  _Schema: any;
  // Add precalculated extend relationships
  _extendRelationships: Map<string, ExtendRelationship> = new Map();
  // Add indexing for better performance
  private _indexes: TableIndex = {};
  private _indexDirty: Set<string> = new Set();

  private _dirty: boolean = false;
  private _changeCount: number = 0;
  private _changeThreshold: number = 100; // customizable
  private _autoSaveInterval: number = 5000; // 5 seconds
  private _lastSaveTime: number = Date.now();

  constructor(name: string, path: string) {
    this._Name = name;
    this._Path = path;
    // Auto-save loop
    setInterval(() => {
      const now = Date.now();
      if (
        this._dirty &&
        (now - this._lastSaveTime > this._autoSaveInterval ||
          this._changeCount >= this._changeThreshold)
      ) {
        this.Save();
      }
    }, 1000); // check every second
  }

  private markDirty() {
    this._dirty = true;
    this._changeCount++;
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
  private updateIndexes(
    operation: "insert" | "update" | "delete",
    rowIndex: number,
    oldValue?: any,
    newValue?: any
  ): void {
    if (!this._Schema) return;

    const schemaKeys = Object.keys(this._Schema);

    for (const column of schemaKeys) {
      if (operation === "insert") {
        const value = this.Data[rowIndex]?.[column];
        if (value !== undefined && this._indexes[column]) {
          if (!this._indexes[column].has(value)) {
            this._indexes[column].set(value, []);
          }
          const indices = this._indexes[column].get(value);
          if (indices) {
            indices.push(rowIndex);
          }
        }
      } else if (operation === "update") {
        // Remove old value
        if (oldValue !== undefined && this._indexes[column]) {
          const oldIndices = this._indexes[column].get(oldValue);
          if (oldIndices) {
            const index = oldIndices.indexOf(rowIndex);
            if (index > -1) {
              oldIndices.splice(index, 1);
            }
          }
        }
        // Add new value
        if (newValue !== undefined && this._indexes[column]) {
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
        if (this._indexes[column]) {
          const indices = this._indexes[column].get(value);
          if (indices) {
            const index = indices.indexOf(rowIndex);
            if (index > -1) {
              indices.splice(index, 1);
            }
          }
        }
      }
    }

    this.markDirty();
  }

  Load = async (DBSchema: string) => {
    try {
      const TableData = Bun.file(
        this._Path + "/Tables/" + this._Name + ".json"
      );

      // Check if file exists
      if (await TableData.exists()) {
        const data = await TableData.json();
        // Validate that data is an array
        if (Array.isArray(data)) {
          this.Data = data;
        } else {
          this.Data = [];
        }
      } else {
        // Create the file with empty array if it doesn't exist
        await this.Save();
        this.Data = [];
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
      const tablesDir = path.join(this._Path, "Tables");
      if (!fs.existsSync(tablesDir)) {
        fs.mkdirSync(tablesDir, { recursive: true });
      }
      const tableFilePath = path.join(tablesDir, `${this._Name}.json`);

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
      // Ensure the Tables directory exists
      const TableData = Bun.file(
        this._Path + "/Tables/" + this._Name + ".json"
      );
      await Bun.write(TableData, JSON.stringify(this.Data));
      this._dirty = false;
      this._changeCount = 0;
      this._lastSaveTime = Date.now();
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
      const tablesDir = require("path").join(this._Path, "Tables");
      if (!require("fs").existsSync(tablesDir)) {
        require("fs").mkdirSync(tablesDir, { recursive: true });
      }
      const tableFilePath = require("path").join(tablesDir, `${this._Name}.json`);
      fs.writeFileSync(tableFilePath, JSON.stringify(this.Data));
      this._dirty = false;
      this._changeCount = 0;
      this._lastSaveTime = Date.now();
    } catch (error) {
      throw new Error(
        `Failed to save table '${this._Name}': ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  Get = (options: QueryOptions = {}): any[] => {
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

      const joinedTable = Database.Tables[table]?.Get(); // Fetch once
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

    result = result.slice(safeOffset, safeLimit);

    return result;
  };

  Insert = async (Values: Record<string, any>, Options?: {}) => {
    const RowToInsert = InsertChecker(Values, this._Schema);
    if (RowToInsert) {
      const insertIndex = this.Data.length;
      this.Data.push(Values);
      this.updateIndexes("insert", insertIndex);

      // await this.Save();
      return Values;
    } else {
      throw new Error("Insert failed: Values do not match table schema.");
    }
  };

  Delete = async (options: DeleteOptions = {}): Promise<number> => {
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
        // Update indexes before removing
        for (const column of Object.keys(this._Schema || {})) {
          this.updateIndexes("delete", index, item[column]);
        }
        this.Data.splice(index, 1);
      }
    }

    // Save changes to disk
    await this.Save();

    return deletedCount;
  };

  Update = async (options: UpdateOptions): Promise<number> => {
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
        // Update indexes for changed values
        for (const entry of Object.entries(validatedValues)) {
          const [key, newValue] = entry;
          const oldValue = this.Data[index][key];
          if (oldValue !== newValue) {
            this.updateIndexes("update", index, oldValue, newValue);
          }
        }

        // Update the item with new values
        Object.assign(this.Data[index], validatedValues);
        updatedCount++;
      }
    }

    // Save changes to disk
    await this.Save();

    return updatedCount;
  };
}
