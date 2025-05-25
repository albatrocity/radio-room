import { ReactionSubject } from "./ReactionSubject";
import { Emoji } from "./Emoji";
import { User } from "./User";

export interface EmojiReaction {
  emoji: Emoji;
  reactTo: ReactionSubject;
  user: User;
}
