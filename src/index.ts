import * as Zap from "./../core/index";
import * as Schema from "@/schema";
async function main() {
  const DB = await Zap.Database.Connect("./data");
  await DB.Migrate(Schema);
  const updatedCount = DB.Tables.Users?.Get({
    Extend: ["Profile"],
  });
  console.dir(updatedCount,{depth:null});
}

main().catch(console.error);
