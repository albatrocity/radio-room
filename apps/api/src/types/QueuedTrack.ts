import { SpotifyEntity } from "./SpotifyEntity";
import { User } from "./User";

export interface QueuedTrack {
  uri: SpotifyEntity["uri"];
  userId: User["userId"];
  username: User["username"];
}
