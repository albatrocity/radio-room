import { Reaction } from "./Reaction";
import { User } from "./User";

export type ChatMessage = {
  content: string;
  timestamp: string;
  user: User;
  mentions?: string[];
  reactions?: Reaction[];
  meta?: {
    status?: "error" | "success" | "warning" | "info";
    type?: "alert" | null;
    title?: string | null;
  };
};
