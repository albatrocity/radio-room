CREATE TABLE "show_segment_track" (
	"id" text PRIMARY KEY NOT NULL,
	"show_segment_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"media_source_type" text,
	"media_source_track_id" text,
	"spotify_track_id" text,
	"track_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "show_segment_track_position_unique" UNIQUE("show_segment_id","position")
);
--> statement-breakpoint
ALTER TABLE "show_segment_track" ADD CONSTRAINT "show_segment_track_show_segment_id_show_segment_id_fk" FOREIGN KEY ("show_segment_id") REFERENCES "public"."show_segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "show_segment_track_show_segment_id_idx" ON "show_segment_track" USING btree ("show_segment_id");