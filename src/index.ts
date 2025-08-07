import * as Zap from "./../core/index";
import * as Schema from "@/schema";
async function main() {
  const DB = await Zap.Database.Connect("./data");
  await DB.Migrate(Schema);
  console.time("Execution");
  // for (let i = 0; i < 1000000; i++) {
  //   DB.Tables.Users?.Insert({
  //     ID: 1,
  //     Email: "test@test.com",
  //     Password: "123",
  //   });
  // }
  DB.Tables.Users?.Get({Extend:["Profile"]})
  console.timeEnd("Execution");
}

main().catch(console.error);
