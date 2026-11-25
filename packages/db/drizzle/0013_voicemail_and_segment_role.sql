CREATE TYPE "public"."segment_role" AS ENUM('standard', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."voicemail_status" AS ENUM('ready', 'hidden');--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "role" "segment_role" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
CREATE TABLE "voicemail" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"s3_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"label" text,
	"status" "voicemail_status" DEFAULT 'ready' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "voicemail_created_at_idx" ON "voicemail" USING btree ("created_at");
