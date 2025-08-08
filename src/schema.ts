import { FieldTypes } from "./types";
import type { RowFromColumns } from "./types";
import type { ReferenceSchema } from "./types";

export type Reference = ReferenceSchema;

export type FieldOptions = {
  notNull?: boolean;
  default?: any;
  enum?: any[];
};

export class FieldObject<
  T = any,
  TNotNull extends boolean = true,
  THasDefault extends boolean = false
> {
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

export function Int(
  options: FieldOptions & { default: number; enum?: number[]; notNull?: true | undefined }
): FieldObject<number, true, true>;
export function Int(
  options: FieldOptions & { default: number; enum?: number[]; notNull: false }
): FieldObject<number, false, true>;
export function Int(
  options: FieldOptions & { enum?: number[]; notNull: false }
): FieldObject<number, false, false>;
export function Int(
  options?: FieldOptions & { enum?: number[]; notNull?: true | undefined }
): FieldObject<number, true, false>;
export function Int(
  options?: FieldOptions & { default?: number; enum?: number[]; notNull?: boolean }
): any {
  return new FieldObject<number>(FieldTypes.Int, options);
}

export function Text(
  options: FieldOptions & { default: string; enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, true>;
export function Text(
  options: FieldOptions & { default: string; enum?: string[]; notNull: false }
): FieldObject<string, false, true>;
export function Text(
  options: FieldOptions & { enum?: string[]; notNull: false }
): FieldObject<string, false, false>;
export function Text(
  options?: FieldOptions & { enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, false>;
export function Text(
  options?: FieldOptions & { default?: string; enum?: string[]; notNull?: boolean }
): any {
  return new FieldObject<string>(FieldTypes.Text, options);
}

export function Float(
  options: FieldOptions & { default: number; enum?: number[]; notNull?: true | undefined }
): FieldObject<number, true, true>;
export function Float(
  options: FieldOptions & { default: number; enum?: number[]; notNull: false }
): FieldObject<number, false, true>;
export function Float(
  options: FieldOptions & { enum?: number[]; notNull: false }
): FieldObject<number, false, false>;
export function Float(
  options?: FieldOptions & { enum?: number[]; notNull?: true | undefined }
): FieldObject<number, true, false>;
export function Float(
  options?: FieldOptions & { default?: number; enum?: number[]; notNull?: boolean }
): any {
  return new FieldObject<number>(FieldTypes.Float, options);
}

export function Boolean(
  options: FieldOptions & { default: boolean; enum?: boolean[]; notNull?: true | undefined }
): FieldObject<boolean, true, true>;
export function Boolean(
  options: FieldOptions & { default: boolean; enum?: boolean[]; notNull: false }
): FieldObject<boolean, false, true>;
export function Boolean(
  options: FieldOptions & { enum?: boolean[]; notNull: false }
): FieldObject<boolean, false, false>;
export function Boolean(
  options?: FieldOptions & { enum?: boolean[]; notNull?: true | undefined }
): FieldObject<boolean, true, false>;
export function Boolean(
  options?: FieldOptions & { default?: boolean; enum?: boolean[]; notNull?: boolean }
): any {
  return new FieldObject<boolean>(FieldTypes.Boolean, options);
}

export function Email(
  options: FieldOptions & { default: string; enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, true>;
export function Email(
  options: FieldOptions & { default: string; enum?: string[]; notNull: false }
): FieldObject<string, false, true>;
export function Email(
  options: FieldOptions & { enum?: string[]; notNull: false }
): FieldObject<string, false, false>;
export function Email(
  options?: FieldOptions & { enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, false>;
export function Email(
  options?: FieldOptions & { default?: string; enum?: string[]; notNull?: boolean }
): any {
  return new FieldObject<string>(FieldTypes.Email, options);
}

export function Date(
  options: FieldOptions & { default: string; enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, true>;
export function Date(
  options: FieldOptions & { default: string; enum?: string[]; notNull: false }
): FieldObject<string, false, true>;
export function Date(
  options: FieldOptions & { enum?: string[]; notNull: false }
): FieldObject<string, false, false>;
export function Date(
  options?: FieldOptions & { enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, false>;
export function Date(
  options?: FieldOptions & { default?: string; enum?: string[]; notNull?: boolean }
): any {
  return new FieldObject<string>(FieldTypes.Date, options);
}

export function DateTime(
  options: FieldOptions & { default: string; enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, true>;
export function DateTime(
  options: FieldOptions & { default: string; enum?: string[]; notNull: false }
): FieldObject<string, false, true>;
export function DateTime(
  options: FieldOptions & { enum?: string[]; notNull: false }
): FieldObject<string, false, false>;
export function DateTime(
  options?: FieldOptions & { enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, false>;
export function DateTime(
  options?: FieldOptions & { default?: string; enum?: string[]; notNull?: boolean }
): any {
  return new FieldObject<string>(FieldTypes.DateTime, options);
}

export function UUID(
  options: FieldOptions & { default: string; enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, true>;
export function UUID(
  options: FieldOptions & { default: string; enum?: string[]; notNull: false }
): FieldObject<string, false, true>;
export function UUID(
  options: FieldOptions & { enum?: string[]; notNull: false }
): FieldObject<string, false, false>;
export function UUID(
  options?: FieldOptions & { enum?: string[]; notNull?: true | undefined }
): FieldObject<string, true, false>;
export function UUID(
  options?: FieldOptions & { default?: string; enum?: string[]; notNull?: boolean }
): any {
  return new FieldObject<string>(FieldTypes.UUID, options);
}

export function Password(options: { notNull: false }): FieldObject<string, false, false>;
export function Password(options?: { notNull?: true | undefined }): FieldObject<string, true, false>;
export function Password(options?: { notNull?: boolean }): any {
  return new FieldObject<string>(FieldTypes.Password, {
    notNull: options?.notNull,
  });
}

export function Json(options: { default: any; reference?: Reference; notNull?: true | undefined }): FieldObject<any, true, true>;
export function Json(options: { default: any; reference?: Reference; notNull: false }): FieldObject<any, false, true>;
export function Json(options: { reference?: Reference; notNull: false }): FieldObject<any, false, false>;
export function Json(options?: { reference?: Reference; notNull?: true | undefined }): FieldObject<any, true, false>;
export function Json(options?: { notNull?: boolean; default?: any; reference?: Reference }): any {
  return new FieldObject<any>(FieldTypes.Json, options);
}

export function Array<T = any>(
  options: FieldOptions & { default: T[]; enum?: T[][]; notNull?: true | undefined }
): FieldObject<T[], true, true>;
export function Array<T = any>(
  options: FieldOptions & { default: T[]; enum?: T[][]; notNull: false }
): FieldObject<T[], false, true>;
export function Array<T = any>(options: FieldOptions & { enum?: T[][]; notNull: false }): FieldObject<T[], false, false>;
export function Array<T = any>(options?: FieldOptions & { enum?: T[][]; notNull?: true | undefined }): FieldObject<T[], true, false>;
export function Array<T = any>(
  options?: FieldOptions & { default?: T[]; enum?: T[][]; notNull?: boolean }
): any {
  return new FieldObject<T[]>(FieldTypes.Array, options);
}

export function Table<TColumns>(name: string, columns: TColumns): TColumns {
  return JSON.parse(JSON.stringify({ ...columns }));
}

export type InferRow<TColumns> = RowFromColumns<TColumns>;
