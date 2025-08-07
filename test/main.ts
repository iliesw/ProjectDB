import * as Optima from "./../dist"
import * as Schema from "./schema"

const DB = Optima.Database.Connect("./data",Schema)
console.log(DB.Tables.Users.Get())