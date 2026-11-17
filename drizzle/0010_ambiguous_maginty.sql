CREATE TABLE "merchant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_email" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" DROP CONSTRAINT "merchants_status_chk";--> statement-breakpoint
ALTER TABLE "merchants" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchant_events" ADD CONSTRAINT "merchant_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_events_merchant_idx" ON "merchant_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_status_chk" CHECK ("merchants"."status" in ('pending', 'active', 'suspended'));