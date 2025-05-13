export interface User {
  id?: string; // socket ID
  userId: string;
  username?: string;
  isAdmin?: boolean;
  isDj?: boolean;
  isDeputyDj?: boolean;
  status?: "participating" | "listening";
}

type Bool = "true" | "false";

export interface StoredUser
  extends Omit<User, "isDj" | "isAdmin" | "isDeputyDj"> {
  isDj: Bool;
  isDeputyDj: Bool;
  isAdmin: Bool;
}
