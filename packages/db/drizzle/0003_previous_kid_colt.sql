ALTER TABLE "segment" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "segment" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."segment_status";--> statement-breakpoint
CREATE TYPE "public"."segment_status" AS ENUM('draft', 'ready', 'archived');--> statement-breakpoint
ALTER TABLE "segment" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."segment_status";--> statement-breakpoint
-- Map removed enum value 'working' -> 'ready' (new enum has draft | ready | archived)
ALTER TABLE "segment" ALTER COLUMN "status" SET DATA TYPE "public"."segment_status" USING (
	CASE "status"::text
		WHEN 'working' THEN 'ready'::"public"."segment_status"
		ELSE "status"::"public"."segment_status"
	END
);--> statement-breakpoint
ALTER TABLE "show" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "show" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."show_status";--> statement-breakpoint
CREATE TYPE "public"."show_status" AS ENUM('draft', 'ready', 'published');--> statement-breakpoint
ALTER TABLE "show" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."show_status";--> statement-breakpoint
ALTER TABLE "show" ALTER COLUMN "status" SET DATA TYPE "public"."show_status" USING "status"::"public"."show_status";