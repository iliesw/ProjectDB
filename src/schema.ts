import { Table, Int, Email, Password, Json } from "@/../core/index";

export const Users = Table("Users", {
  ID: Int(),
  Email: Email(),
  Password: Password(),
});

export const Profile = Table("Profile", {
  UserID: Int().reference(() => [Users.ID]),
  Data: Json(),
});

