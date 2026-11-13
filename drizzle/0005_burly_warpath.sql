CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"user" jsonb NOT NULL,
	"encrypted_tokens" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_id_chk" CHECK ("auth_sessions"."id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beneficiaries_not_self_chk" CHECK ("beneficiaries"."owner_id" <> "beneficiaries"."recipient_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"reference" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_auth_requests" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"encrypted_context" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"rule" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_rule_key_hash_pk" PRIMARY KEY("rule","key_hash"),
	CONSTRAINT "rate_limits_key_hash_chk" CHECK ("rate_limits"."key_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "rate_limits_count_chk" CHECK ("rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_pins" (
	"user_id" uuid NOT NULL,
	"product" text NOT NULL,
	"salt" text NOT NULL,
	"hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_pins_user_id_product_pk" PRIMARY KEY("user_id","product"),
	CONSTRAINT "wallet_pins_product_chk" CHECK ("wallet_pins"."product" in ('pay', 'wallet')),
	CONSTRAINT "wallet_pins_attempts_chk" CHECK ("wallet_pins"."failed_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "tag" text;--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_owner_id_pay_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_recipient_id_pay_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pins" ADD CONSTRAINT "wallet_pins_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "beneficiaries_owner_recipient_uq" ON "beneficiaries" USING btree ("owner_id","recipient_id");--> statement-breakpoint
CREATE INDEX "beneficiaries_owner_recent_idx" ON "beneficiaries" USING btree ("owner_id","last_sent_at");--> statement-breakpoint
CREATE INDEX "notifications_user_recent_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "oidc_auth_requests_expires_idx" ON "oidc_auth_requests" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "pay_users" ADD CONSTRAINT "pay_users_tag_unique" UNIQUE("tag");--> statement-breakpoint
ALTER TABLE "pay_users" ADD CONSTRAINT "pay_users_tag_chk" CHECK ("pay_users"."tag" is null or ("pay_users"."tag" ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' and length("pay_users"."tag") between 3 and 20));