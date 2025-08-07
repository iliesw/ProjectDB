import { FieldTypes } from "./types";
import type { ReferenceSchema } from "./types";

export type Reference = ReferenceSchema;

export type FieldOptions = {
  notNull?: boolean;
  default?: any;
  enum?: any[];
};

export class FieldObject<T = any> {
  public Type: FieldTypes;
  public NotNull?: boolean | null;
  public Default?: T | null;
  public Enum?: T[] | null;
  public Reference?: Reference | null;

  constructor(
    type: FieldTypes,
    options?: FieldOptions & { default?: T; enum?: T[] }
  ) {
    this.Type = type;
    this.NotNull = options?.notNull !== undefined ? options.notNull : null;
    this.Default = options?.default !== undefined ? options.default : null;
    this.Enum = options?.enum !== undefined ? options.enum : null;
  }

  reference = (ref: () => [any] | any) => {
    // Try to extract the reference from the function's source code
    const refStr = ref.toString().replace(/\s/g, "");
    // Match patterns like "()=>[Users.ID]" or "()=>Users.ID"
    let match = refStr.match(/\(\)=>\[(\w+)\.(\w+)\]/);
    let isArray = false;
    let table: string | undefined;
    let field: string | undefined;

    if (match) {
      // Array reference
      isArray = true;
      table = match[1];
      field = match[2];
    } else {
      // Try single reference: "()=>Users.ID"
      match = refStr.match(/\(\)=>(\w+)\.(\w+)/);
      if (match) {
        isArray = false;
        table = match[1];
        field = match[2];
      }
    }

    if (!table || !field) {
      throw new Error("Invalid reference function format. Expected () => [Table.Field] or () => Table.Field");
    }

    this.Reference = {
      Field: field,
      Table: table,
      Type: isArray ? "MANY" : "ONE",
    };
    return this;
  };
}

export const Int = (
  options?: FieldOptions & { default?: number; enum?: number[] }
): FieldObject<number> => {
  return new FieldObject<number>(FieldTypes.Int, options);
};

export const Text = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.Text, options);
};

export const Float = (
  options?: FieldOptions & { default?: number; enum?: number[] }
): FieldObject<number> => {
  return new FieldObject<number>(FieldTypes.Float, options);
};

export const Boolean = (
  options?: FieldOptions & { default?: boolean; enum?: boolean[] }
): FieldObject<boolean> => {
  return new FieldObject<boolean>(FieldTypes.Boolean, options);
};

export const Email = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.Email, options);
};

export const Date = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.Date, options);
};

export const DateTime = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.DateTime, options);
};

export const UUID = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.UUID, options);
};

export const Password = (options?: {
  notNull: boolean;
}): FieldObject<string> => {
  return new FieldObject<string>(FieldTypes.Password, {
    notNull: options?.notNull,
  });
};

export const Json = (options?: {
  notNull?: boolean;
  default?: any;
  reference?: Reference;
}): FieldObject<any> => {
  return new FieldObject<any>(FieldTypes.Json, options);
};

export const Array = <T = any>(
  options?: FieldOptions & { default?: T[]; enum?: T[][] }
): FieldObject<T[]> => {
  return new FieldObject<T[]>(FieldTypes.Array, options);
};

export function Table<T>(name: string, columns: T): T {
  return JSON.parse(JSON.stringify({ ...columns }));
}
