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