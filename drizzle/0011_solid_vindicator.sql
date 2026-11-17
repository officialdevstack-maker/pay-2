CREATE TABLE "merchant_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"checklist" jsonb DEFAULT '{"registrationVerified":false,"ownershipVerified":false,"settlementAccountVerified":false,"riskReviewComplete":false}'::jsonb NOT NULL,
	"due_diligence_notes" text DEFAULT '' NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_onboarding_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "merchant_webhook_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_status" integer,
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "merchant_webhook_attempts_number_chk" CHECK ("merchant_webhook_attempts"."attempt_number" > 0),
	CONSTRAINT "merchant_webhook_attempts_status_chk" CHECK ("merchant_webhook_attempts"."status" in ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "merchant_webhook_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"signing_secret_encrypted" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_webhook_configs_merchant_id_unique" UNIQUE("merchant_id"),
	CONSTRAINT "merchant_webhook_max_attempts_chk" CHECK ("merchant_webhook_configs"."max_attempts" between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "merchant_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_status_code" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_webhook_deliveries_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "merchant_webhook_deliveries_status_chk" CHECK ("merchant_webhook_deliveries"."status" in ('pending', 'sending', 'delivered', 'failed')),
	CONSTRAINT "merchant_webhook_deliveries_attempts_chk" CHECK ("merchant_webhook_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "merchant_onboarding" ADD CONSTRAINT "merchant_onboarding_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_webhook_attempts" ADD CONSTRAINT "merchant_webhook_attempts_delivery_id_merchant_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."merchant_webhook_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_webhook_configs" ADD CONSTRAINT "merchant_webhook_configs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_webhook_deliveries" ADD CONSTRAINT "merchant_webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_onboarding_merchant_idx" ON "merchant_onboarding" USING btree ("merchant_id","updated_at");--> statement-breakpoint
CREATE INDEX "merchant_webhook_attempts_delivery_idx" ON "merchant_webhook_attempts" USING btree ("delivery_id","attempted_at");--> statement-breakpoint
CREATE INDEX "merchant_webhook_deliveries_due_idx" ON "merchant_webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "merchant_webhook_deliveries_merchant_idx" ON "merchant_webhook_deliveries" USING btree ("merchant_id","created_at");