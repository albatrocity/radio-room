import { Server } from "socket.io";
import { TriggerEvent, WithTriggerMeta } from "../types/Triggers";
import likeSpotifyTrack from "../operations/spotify/likeSpotifyTrack";
import skipSpotifyTrack from "../operations/spotify/skipSpotifyTrack";
import pauseSpotify from "../operations/spotify/pauseSpotify";
import resumeSpotify from "../operations/spotify/resumeSpotify";

import { WithTimestamp } from "../types/Utility";
import { PlaylistTrack } from "../types/PlaylistTrack";

function sendMetaMessage<Incoming, Source>(
  data: WithTriggerMeta<Incoming, Source>,
  trigger: TriggerEvent<Source>,
  io: Server
) {
  // if (trigger.meta?.messageTemplate) {
  //   const message = parseMessage(trigger.meta.messageTemplate, {
  //     ...data,
  //     target: {
  //       ...data.meta.target,
  //     },
  //     trigger,
  //   });
  //   sendMessage(
  //     io,
  //     systemMessage(
  //       message.content,
  //       {
  //         status: "info",
  //         title: `${trigger.action} action was triggered`,
  //       },
  //       message.mentions
  //     )
  //   );
  // }
}

export default function performTriggerAction<Incoming, Source>(
  data: WithTriggerMeta<Incoming, Source>,
  trigger: TriggerEvent<Source>,
  io: Server
) {
  switch (trigger.action) {
    case "skipTrack":
      skipSpotifyTrack("FIX_ME");
      sendMetaMessage<Incoming, Source>(data, trigger, io);
      break;
    case "likeTrack":
      let targetTrackUri = (data.meta.target as PlaylistTrack)?.spotifyData
        ?.uri;
      targetTrackUri ? likeSpotifyTrack(targetTrackUri, "FIX_ME") : undefined;
      sendMetaMessage<Incoming, Source>(data, trigger, io);
      break;
    case "sendMessage":
      if (trigger.meta?.messageTemplate) {
        sendMetaMessage<Incoming, Source>(data, trigger, io);
      }
      break;
    case "pause":
      // pauseSpotify();
      sendMetaMessage<Incoming, Source>(data, trigger, io);
      break;
    case "resume":
      // resumeSpotify();
      sendMetaMessage<Incoming, Source>(data, trigger, io);
      break;
  }

  // const currentEvents = getters.getTriggerEventHistory();

  // setters.setTriggerEventHistory([
  //   ...currentEvents,
  //   {
  //     ...trigger,
  //     timestamp: new Date().toString(),
  //   },
  // ] as WithTimestamp<TriggerEvent<any>>[]);
}
