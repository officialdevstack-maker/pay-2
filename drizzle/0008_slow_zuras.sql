CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"merchant_reference" text NOT NULL,
	"description" text,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"transaction_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_sessions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "checkout_sessions_reference_chk" CHECK ("checkout_sessions"."reference" ~ '^SPY_[A-Z0-9]{16}$'),
	CONSTRAINT "checkout_sessions_amount_chk" CHECK ("checkout_sessions"."amount" > 0),
	CONSTRAINT "checkout_sessions_currency_chk" CHECK ("checkout_sessions"."currency" = 'NGN'),
	CONSTRAINT "checkout_sessions_status_chk" CHECK ("checkout_sessions"."status" in ('open', 'paid', 'cancelled')),
	CONSTRAINT "checkout_sessions_paid_chk" CHECK (("checkout_sessions"."status" = 'paid') = ("checkout_sessions"."transaction_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "checkout_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"provider_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_transfers_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "checkout_transfers_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "checkout_transfers_account_chk" CHECK ("checkout_transfers"."account_number" ~ '^[0-9]{10}$')
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"return_url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "merchants_ledger_account_id_unique" UNIQUE("ledger_account_id"),
	CONSTRAINT "merchants_status_chk" CHECK ("merchants"."status" in ('active', 'suspended')),
	CONSTRAINT "merchants_return_url_chk" CHECK ("merchants"."return_url" ~ '^https?://')
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_transfers" ADD CONSTRAINT "checkout_transfers_session_id_checkout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_sessions_merchant_key_uq" ON "checkout_sessions" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "checkout_sessions_merchant_idx" ON "checkout_sessions" USING btree ("merchant_id","created_at");