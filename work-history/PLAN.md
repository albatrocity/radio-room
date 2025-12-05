# App background

This application, called Radio Room, is a "listening" room app. Users can create a room of their own and connect a music streaming service by authenticating their music service account with the app. I currently support Spotify but plan to support others via adapters. Once a music service is conencted, the room facilitates chat, a "now playing" display, and a playlist history. The room creator can also designate other users in the room as "DJs". DJs can search for songs to play (using the room creator's streaming service search API) and add songs to the room creator's playback queue.

Users can add emoji reactions to messages and songs that are playing. A running list of songs that have played is retained as a playlist within the app. At any time, this playlist can be "exported" back to the room creator's music platform using its API.

Redis and websockets are used to facilitate "realtime" data. This app is not concerned with long-term persistence.

# v2 Plan

Rewrite radio room as a modular engine. This means [listening room](http://listeningroom.club) would be an instance of this engine with its own configuration.

These are the concepts that will be taken into consideration:

## Playback Controllers

A Playback Controller provides an interface for playback and queue management.
Playback Controllers can be registered at runtime and configured per room.

Example playback controllers:

- Spotify
- Tidal (is there a playback API?)
- Apple Music (is there a playback API?)
- Webhook

### API Methods

- `play()`
- `pause()`
- `skipToNextMedia(): PlaybackSourceQueue`
- `skipToPreviousMedia(): PlaybackSourceQueue`
- `seekTo(time: int)`
- `getQueue(): PlaybackSourceQueue`
- `addToQueue(mediaId: string, position?: int)`

### Lifecycle events

Playback Controllers should be able to register callbacks to execute during different lifecycle hooks, including:

- `onRegistered`
- `onAuthenticatedCompleted` - e.g. API key was accepted
- `onAuthenticationFailed`
- `onAuthorizationCompleted`
- `onAuthorizationFailed` - e.g. application scopes don't cover the attempted action
- `onPlay`
- `onPause`
- `onChangeMedia`
- `onError`

## Metadata Sources

A Metadata Source provides an interface to look up information about a piece of media based on string search query or a normalized set of query parameters. Metadata Sources are responsible for returning track, artist, and album information to use.
Metadata Sources can be registered at runtime and configured per room.

Example Metadata Sources:

- Spotify
- Tidal (is there a search API?)
- Apple Music (is there a search API?)
- [MusicBrainz](http://musicbrainz.org)
- Webhook

### API Methods

- `search(query: string): MetadataSourceSearchResult`
- `searchByParams(query: MetadataSourceSearchParameters<T extends MetadataSource>): MetadataSourceSearchResult `

### Lifecycle events

Metadata Sources should be able to register callbacks to execute during different lifecycle hooks including:

- `onRegistered`
- `onAuthenticatedCompleted` - e.g. API key was accepted
- `onAuthenticationFailed`
- `onAuthorizationCompleted`
- `onAuthorizationFailed` - e.g. application scopes don't cover the attempted action
- `onQueryStarted`
- `onQueryCompleted`
- `onError`

## Media Sources

A Media Source provides an interface with callbacks that get called on media events. An example of a Media Source would be a Shoutcast station. The Shoutcast Station Media Source's implementation should handle getting data from a source and calling callbacks. Each Media Source implementation would do the work necessary to fetch media data by polling an endpoint (which is currently how the Shoutcast radio works), registering a webhook listener, or some other subscription method.

### Lifecycle events

Media Sources should be able to register callbacks to execute during different lifecycle hooks including:

- `onRegistered`
- `onAuthenticatedCompleted` - e.g. API key was accepted
- `onAuthenticationFailed`
- `onOnline`
- `onOffline`
- `onMediaData`
- `onError`

## Rooms

Rooms need to be explored a little further, but they'll probably work similar to how they do now with the addition of lifecycle events, including:

- `onCreated`
- `onStationConnected` - on first successful Shoutcast metadata query
- `onStationConnectionFailure` - on every unsuccessful Shoutcast metadata query
- `onStationDisconnected` - on first unsuccessful Shoutcast metadata query after previously connected
- `beforeDestroy`
- `onDestroyed`
