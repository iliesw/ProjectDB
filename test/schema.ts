import { Table, Int, Email, Password, Json } from "./../dist";

export const Users = Table("Users", {
  ID: Int(),
  Email: Email(),
  Password: Password(),
});

export const Profile = Table("Profile", {
  UserID: Int().reference(() => [Users.ID]),
  Data: Json(),
});