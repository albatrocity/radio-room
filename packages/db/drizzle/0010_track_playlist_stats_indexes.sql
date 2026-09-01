CREATE INDEX "room_playlist_track_media_source_idx" ON "room_playlist_track" USING btree ("media_source_type","media_source_track_id");--> statement-breakpoint
CREATE INDEX "room_playlist_track_spotify_track_id_idx" ON "room_playlist_track" USING btree ("spotify_track_id");--> statement-breakpoint
CREATE INDEX "room_playlist_track_tidal_track_id_idx" ON "room_playlist_track" USING btree ("tidal_track_id");
