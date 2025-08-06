import { FieldTypes } from "./types";
import { Database } from "./database";

type SchemaField = {
  Type: string;
  NotNull: boolean;
  Enum?: any[];
  Referance?: { Table: string; Field: string; Type: string };
};
type SchemaType = Record<string, SchemaField>;
type TypeCheckerFn = (val: any) => boolean;

// Add interface for precalculated extend relationships
interface ExtendRelationship {
  myColumn: string;
  targetColumn: string;
  referenceType: string;
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

  // Check for extra keys in Values not present in Schema
  for (const key of valueKeys) {
    if (!schemaKeys.includes(key)) {
      return null;
    }
  }

  // Build the row to insert, filling missing keys with null or undefined
  const rowToInsert: Record<string, any> = {};
  for (const key of schemaKeys) {
    const field = Schema[key];
    if (!field) continue;
    if (Object.prototype.hasOwnProperty.call(Values, key)) {
      rowToInsert[key] = Values[key];
    } else if (field.NotNull === false) {
      rowToInsert[key] = null;
    }
    // If NotNull is true and value is missing, leave as undefined (will fail below)
  }

  // Validate types and required fields
  for (const key of schemaKeys) {
    const field = Schema[key];
    if (!field) continue;
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

    // Type check
    const checker = TypeChecker[Type];
    if (checker && !checker(value)) return false;

    // Enum value check
    if (field.Enum && Array.isArray(EnumValues)) {
      if (!field.Enum.includes(value)) return false;
    }
  }

  return rowToInsert;
};

const UpdateChecker = (Values: Record<string, any>, Schema: SchemaType) => {
  const schemaKeys = Object.keys(Schema);
  const valueKeys = Object.keys(Values);

  // Check for extra keys in Values not present in Schema
  for (const key of valueKeys) {
    if (!schemaKeys.includes(key)) {
      return null;
    }
  }

  // Validate only the provided values (no NotNull checks for updates)
  for (const key of valueKeys) {
    const field = Schema[key];
    if (!field) continue;
    const { Type, Enum: EnumValues } = field;
    const value = Values[key];

    // Skip validation for null/undefined values in updates
    if (value === null || value === undefined) {
      continue;
    }

    // Type check
    const checker = TypeChecker[Type];
    if (checker && !checker(value)) return false;

    // Enum value check
    if (field.Enum && Array.isArray(EnumValues)) {
      if (!field.Enum.includes(value)) return false;
    }
  }

  return Values;
};

export class Table {
  Data: any[] = [];
  _Name: string;
  _Path: string;
  _Schema: any;
  // Add precalculated extend relationships
  _extendRelationships: Map<string, ExtendRelationship> = new Map();

  constructor(name: string, path: string) {
    this._Name = name;
    this._Path = path;
    // Don't auto-load in constructor since it's async
  }

  // Add method to precalculate extend relationships
  private precalculateExtendRelationships(DBSchema: any): void {
    this._extendRelationships.clear();
    for (const table of Object.keys(DBSchema.Tables)) {
      if (table === this._Name) continue;
      const TableFields = Object.keys(DBSchema.Tables[table]);
      TableFields.forEach((elem) => {
        if (
          DBSchema.Tables[table][elem].Referance &&
          DBSchema.Tables[table][elem].Referance.Table == this._Name
        ) {
          const relationship: ExtendRelationship = {
            myColumn: DBSchema.Tables[table][elem].Referance.Field,
            targetColumn: elem,
            referenceType: DBSchema.Tables[table][elem].Referance.Type || "ONE",
          };
          this._extendRelationships.set(table, relationship);
        }
      });
    }
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
    } catch (error) {
      // If file is corrupted, start with empty array and recreate it
      this.Data = [];
      await this.Save();
      this.precalculateExtendRelationships(DBSchema);
    }
  };

  Save = async () => {
    try {
      // Ensure the Tables directory exists by trying to write the file
      // Bun will create the directory structure automatically if it doesn't exist
      const TableData = Bun.file(
        this._Path + "/Tables/" + this._Name + ".json"
      );
      await Bun.write(TableData, JSON.stringify(this.Data));
    } catch (error) {
      throw new Error(
        `Failed to save table '${this._Name}': ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  Get = ({
    Columns,
    Limit,
    Offset,
    Unique,
    OrderBy,
    Matches,
    Extend,
  }: {
    Columns?: string[];
    Limit?: number;
    Offset?: number;
    Unique?: boolean;
    OrderBy?: {
      Collumn: string;
      Direction: "ASC" | "DESC";
    };
    Matches?: Record<string, any>;
    Extend?: string[];
  } = {}): any[] => {
    // console.log(this._extendRelationships)
    let result = Array.isArray(this.Data) ? [...this.Data] : [];

    // Filter by condition if provided
    if (Matches && typeof Matches === "object") {
      result = result.filter((row) =>
        Object.entries(Matches).every(([key, value]) => row[key] === value)
      );
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
    if (OrderBy && OrderBy.Collumn) {
      result.sort((a, b) => {
        const col = OrderBy.Collumn;
        if (a[col] < b[col]) return OrderBy.Direction === "ASC" ? -1 : 1;
        if (a[col] > b[col]) return OrderBy.Direction === "ASC" ? 1 : -1;
        return 0;
      });
    }

    // Extend
    Extend?.forEach((table) => {
      const RelationDetail = this._extendRelationships.get(table);
      if (!RelationDetail) throw new Error("Extend Error : Relation Undefined");
      result = result.map((old) => {
        const Data = Database.Tables[table]?.Get({
          Matches: {
            [RelationDetail.targetColumn]: old[RelationDetail.myColumn],
          },
        });

        let DataToAttach = null;
        if (Data && Data.length !=0) {
          DataToAttach = RelationDetail.referenceType == "ONE" ? Data[0] : Data;
        }
        return { ...old, ["$"+table]: DataToAttach };
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
      this.Data.push(RowToInsert);
      await this.Save();
      return RowToInsert;
    } else {
      throw new Error("Insert failed: Values do not match table schema.");
    }
  };

  Delete = async ({
    Matches,
    Limit,
    Offset,
  }: {
    Matches?: Record<string, any>;
    Limit?: number;
    Offset?: number;
  } = {}): Promise<number> => {
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

    // Remove the filtered items from the original data
    const deletedCount = itemsToDelete.length;
    this.Data = this.Data.filter((row) => !itemsToDelete.includes(row));

    // Save changes to disk
    await this.Save();

    return deletedCount;
  };

  Update = async ({
    Matches,
    Values,
    Limit,
    Offset,
  }: {
    Matches?: Record<string, any>;
    Values: Record<string, any>;
    Limit?: number;
    Offset?: number;
  }): Promise<number> => {
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
