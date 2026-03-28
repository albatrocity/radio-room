CREATE TYPE "public"."segment_status" AS ENUM('draft', 'working', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."show_status" AS ENUM('working', 'ready', 'published');--> statement-breakpoint
CREATE TYPE "public"."tag_type" AS ENUM('segment', 'show');--> statement-breakpoint
CREATE TABLE "segment" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"plugin_preset" jsonb,
	"status" "segment_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_tag" (
	"segment_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "segment_tag_segment_id_tag_id_pk" PRIMARY KEY("segment_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "show" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"room_id" text,
	"status" "show_status" DEFAULT 'working' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "show_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "show_segment_position_unique" UNIQUE("show_id","position")
);
--> statement-breakpoint
CREATE TABLE "show_tag" (
	"show_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "show_tag_show_id_tag_id_pk" PRIMARY KEY("show_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "tag_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_name_type_unique" UNIQUE("name","type")
);
--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_tag" ADD CONSTRAINT "segment_tag_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_tag" ADD CONSTRAINT "segment_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show" ADD CONSTRAINT "show_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_segment" ADD CONSTRAINT "show_segment_show_id_show_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."show"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_segment" ADD CONSTRAINT "show_segment_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_tag" ADD CONSTRAINT "show_tag_show_id_show_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."show"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_tag" ADD CONSTRAINT "show_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;