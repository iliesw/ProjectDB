import * as Optima from "./../dist";
import * as Schema from "./schema";

const DB = new Optima.Database("./data", Schema);

// trigger events
(async () => {
  await DB.Tables.Users.Insert({ ID: 1, Email: "a@b.com", Password: "secret" });
  DB.Tables.Users.Get({ Matches: { ID: 1 } });
  await DB.Tables.Users.Update({
    Matches: { ID: 1 },
    Values: { Email: "new@b.com" },
  });
})();
