CREATE TABLE "idempotency_keys" (
	"scope" varchar(128) NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_idempotency_key_pk" PRIMARY KEY("scope","idempotency_key"),
	CONSTRAINT "idempotency_keys_transaction_unique" UNIQUE("transaction_id"),
	CONSTRAINT "idempotency_keys_request_hash_check" CHECK ("idempotency_keys"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid,
	"system_code" varchar(32),
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_system_currency_unique" UNIQUE("system_code","currency"),
	CONSTRAINT "ledger_accounts_owner_check" CHECK (("ledger_accounts"."wallet_id" is not null and "ledger_accounts"."system_code" is null) or ("ledger_accounts"."wallet_id" is null and "ledger_accounts"."system_code" is not null)),
	CONSTRAINT "ledger_accounts_currency_check" CHECK ("ledger_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_accounts_system_code_check" CHECK ("ledger_accounts"."system_code" is null or "ledger_accounts"."system_code" in ('provider_clearing', 'fees', 'suspense', 'settlement'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" varchar(6) NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_direction_check" CHECK ("ledger_entries"."direction" in ('debit', 'credit')),
	CONSTRAINT "ledger_entries_amount_positive_check" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entries_currency_check" CHECK ("ledger_entries"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"reversal_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"product" varchar(16) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_owner_product_currency_unique" UNIQUE("owner_user_id","product","currency"),
	CONSTRAINT "wallets_product_check" CHECK ("wallets"."product" in ('pay', 'wallet')),
	CONSTRAINT "wallets_currency_check" CHECK ("wallets"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "wallets_balance_nonnegative_check" CHECK ("wallets"."balance" >= 0),
	CONSTRAINT "wallets_version_nonnegative_check" CHECK ("wallets"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_of_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_pay_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_wallet_unique" ON "ledger_accounts" USING btree ("wallet_id") WHERE "ledger_accounts"."wallet_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_at_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_reversal_of_unique" ON "transactions" USING btree ("reversal_of") WHERE "transactions"."reversal_of" is not null;--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "ledger_accounts" ("system_code", "currency") VALUES
	('provider_clearing', 'NGN'),
	('fees', 'NGN'),
	('suspense', 'NGN'),
	('settlement', 'NGN')
ON CONFLICT ("system_code", "currency") DO NOTHING;--> statement-breakpoint
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'Ledger records are immutable'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();--> statement-breakpoint
CREATE FUNCTION enforce_ledger_entry_currency() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	account_currency varchar(3);
BEGIN
	SELECT "currency" INTO account_currency
	FROM "ledger_accounts"
	WHERE "id" = NEW."account_id";

	IF account_currency IS NULL OR account_currency <> NEW."currency" THEN
		RAISE EXCEPTION 'Ledger entry currency must match its account'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entry_currency_check
BEFORE INSERT ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_entry_currency();--> statement-breakpoint
CREATE FUNCTION assert_ledger_transaction_balanced(target_transaction_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	entry_count integer;
	currency_count integer;
	debit_total numeric;
	credit_total numeric;
BEGIN
	SELECT
		COUNT(*),
		COUNT(DISTINCT "currency"),
		COALESCE(SUM("amount") FILTER (WHERE "direction" = 'debit'), 0),
		COALESCE(SUM("amount") FILTER (WHERE "direction" = 'credit'), 0)
	INTO entry_count, currency_count, debit_total, credit_total
	FROM "ledger_entries"
	WHERE "transaction_id" = target_transaction_id;

	IF entry_count < 2 OR currency_count <> 1 OR debit_total <> credit_total THEN
		RAISE EXCEPTION 'Ledger transaction must have balanced entries in one currency'
			USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION validate_transaction_balance() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_transaction_balanced(NEW."id");
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION validate_entry_transaction_balance() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_transaction_balanced(NEW."transaction_id");
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER transactions_balanced_constraint
AFTER INSERT ON "transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_transaction_balance();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced_constraint
AFTER INSERT ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_entry_transaction_balance();--> statement-breakpoint
CREATE FUNCTION enforce_idempotency_completion() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "idempotency_keys"
		WHERE "scope" = NEW."scope"
			AND "idempotency_key" = NEW."idempotency_key"
			AND "transaction_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Idempotency key must reference a completed transaction'
			USING ERRCODE = '23514';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER idempotency_keys_complete_constraint
AFTER INSERT OR UPDATE ON "idempotency_keys"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_idempotency_completion();