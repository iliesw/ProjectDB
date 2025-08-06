export type Referance = {
  Table: string;
  Field: string;
  Type: "MANY" | "ONE";
};

export type FieldOptions = {
  notNull?: boolean;
  default?: any;
  enum?: any[];
  referance?: Referance;
};

export class FieldObject<T = any> {
  public Type: string;
  public NotNull?: boolean | null;
  public Default?: T | null;
  public Enum?: T[] | null;
  public Referance?: Referance | null;

  constructor(
    type: string,
    options?: FieldOptions & { default?: T; enum?: T[] }
  ) {
    this.Type = type;
    this.NotNull = options?.notNull !== undefined ? options.notNull : null;
    this.Default = options?.default !== undefined ? options.default : null;
    this.Enum = options?.enum !== undefined ? options.enum : null;
    this.Referance =
      options?.referance !== undefined ? options.referance : null;
  }
}

export const Int = (
  options?: FieldOptions & { default?: number; enum?: number[] }
): FieldObject<number> => {
  return new FieldObject<number>("INT", options);
};

export const Text = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>("TEXT", options);
};

export const Float = (
  options?: FieldOptions & { default?: number; enum?: number[] }
): FieldObject<number> => {
  return new FieldObject<number>("FLOAT", options);
};

export const Boolean = (
  options?: FieldOptions & { default?: boolean; enum?: boolean[] }
): FieldObject<boolean> => {
  return new FieldObject<boolean>("BOOLEAN", options);
};

export const Email = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>("EMAIL", options);
};

export const Date = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>("DATE", options);
};

export const DateTime = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>("DATETIME", options);
};

export const UUID = (
  options?: FieldOptions & { default?: string; enum?: string[] }
): FieldObject<string> => {
  return new FieldObject<string>("UUID", options);
};

export const Password = (options?: {
  notNull: boolean;
}): FieldObject<string> => {
  return new FieldObject<string>("PASSWORD", {
    notNull: options?.notNull,
  });
};

export const Json = (options?: {
  notNull?: boolean;
  default?: any;
  referance?: Referance;
}): FieldObject<any> => {
  return new FieldObject<any>("JSON", options);
};

export const Array = <T = any>(
  options?: FieldOptions & { default?: T[]; enum?: T[][] }
): FieldObject<T[]> => {
  return new FieldObject<T[]>("ARRAY", options);
};

export const Table = (name: string, columns: Record<string, FieldObject>) => {
  return JSON.parse(JSON.stringify({ ...columns }));
};


