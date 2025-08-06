import { Table, Int, Email, Password, Json } from "@/../core/index";

export const Users = Table("Users", {
  ID: Int(),
  Email: Email(),
  Password: Password(),
});

export const Profile = Table("Profile", {
  UserID: Int({
    referance: {
      Table: "Users",
      Field: "ID",
      Type: "ONE",
    },
  }),
  Data: Json(),
});
