CREATE TYPE "public"."newsletter_issue_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "newsletter_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"status" "newsletter_issue_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"wants_email" boolean DEFAULT true NOT NULL,
	"entitlement" text DEFAULT 'free' NOT NULL,
	"source" text,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "newsletter_issue" ADD CONSTRAINT "newsletter_issue_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber" ADD CONSTRAINT "subscriber_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;