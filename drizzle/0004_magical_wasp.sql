CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"raw_body" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_status_chk" CHECK ("webhook_events"."status" in ('received', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_driver_event_uq" ON "webhook_events" USING btree ("driver","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "webhook_events" USING btree ("status","received_at");