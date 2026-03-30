CREATE TYPE "public"."room_export_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "room_export" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"status" "room_export_status" DEFAULT 'draft' NOT NULL,
	"playlist_links" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_export_show_id_unique" UNIQUE("show_id")
);
--> statement-breakpoint
CREATE TABLE "room_playlist_track" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"room_export_id" text,
	"position" integer NOT NULL,
	"played_at" timestamp with time zone,
	"added_at" timestamp with time zone,
	"title" text DEFAULT '' NOT NULL,
	"added_by_user_id" text,
	"media_source_type" text,
	"media_source_track_id" text,
	"spotify_track_id" text,
	"tidal_track_id" text,
	"track_payload" jsonb,
	CONSTRAINT "room_playlist_track_show_position_unique" UNIQUE("show_id","position")
);
--> statement-breakpoint
ALTER TABLE "room_export" ADD CONSTRAINT "room_export_show_id_show_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."show"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_playlist_track" ADD CONSTRAINT "room_playlist_track_show_id_show_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."show"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_playlist_track" ADD CONSTRAINT "room_playlist_track_room_export_id_room_export_id_fk" FOREIGN KEY ("room_export_id") REFERENCES "public"."room_export"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_playlist_track_show_id_idx" ON "room_playlist_track" USING btree ("show_id");