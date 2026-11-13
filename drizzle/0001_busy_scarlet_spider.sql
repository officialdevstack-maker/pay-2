CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key"),
	CONSTRAINT "idempotency_scope_chk" CHECK (length(trim("idempotency_keys"."scope")) between 1 and 128),
	CONSTRAINT "idempotency_key_chk" CHECK (length(trim("idempotency_keys"."key")) between 1 and 200),
	CONSTRAINT "idempotency_hash_chk" CHECK ("idempotency_keys"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"normal_side" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "ledger_accounts_kind_chk" CHECK ("ledger_accounts"."kind" in ('wallet', 'system')),
	CONSTRAINT "ledger_accounts_side_chk" CHECK ("ledger_accounts"."normal_side" in ('debit', 'credit')),
	CONSTRAINT "ledger_accounts_currency_chk" CHECK ("ledger_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_accounts_code_kind_chk" CHECK (("ledger_accounts"."kind" = 'system' and "ledger_accounts"."code" is not null) or ("ledger_accounts"."kind" = 'wallet' and "ledger_accounts"."code" is null)),
	CONSTRAINT "ledger_accounts_balance_chk" CHECK ("ledger_accounts"."kind" = 'system' or (not "ledger_accounts"."allow_negative" and "ledger_accounts"."balance" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_direction_chk" CHECK ("ledger_entries"."direction" in ('debit', 'credit')),
	CONSTRAINT "ledger_entries_amount_chk" CHECK ("ledger_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"reverses_transaction_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transactions_reference_chk" CHECK ("transactions"."reference" ~ '^SPY_[A-Z0-9]{16}$'),
	CONSTRAINT "transactions_type_chk" CHECK (length(trim("transactions"."type")) > 0),
	CONSTRAINT "transactions_currency_chk" CHECK ("transactions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product" text DEFAULT 'pay' NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_ledger_account_id_unique" UNIQUE("ledger_account_id"),
	CONSTRAINT "wallets_product_chk" CHECK ("wallets"."product" in ('pay', 'wallet'))
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reverses_transaction_id_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "ledger_entries_txn_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_reverses_uq" ON "transactions" USING btree ("reverses_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_product_uq" ON "wallets" USING btree ("user_id","product");--> statement-breakpoint
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'Ledger records are immutable'
		USING ERRCODE = '55000';
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER transactions_immutable
BEFORE UPDATE OR DELETE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();--> statement-breakpoint
CREATE FUNCTION enforce_ledger_account_identity() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Ledger account identity is immutable'
			USING ERRCODE = '55000';
	END IF;

	IF OLD."id" IS DISTINCT FROM NEW."id"
		OR OLD."kind" IS DISTINCT FROM NEW."kind"
		OR OLD."code" IS DISTINCT FROM NEW."code"
		OR OLD."currency" IS DISTINCT FROM NEW."currency"
		OR OLD."normal_side" IS DISTINCT FROM NEW."normal_side"
		OR OLD."allow_negative" IS DISTINCT FROM NEW."allow_negative"
		OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
		RAISE EXCEPTION 'Ledger account identity is immutable'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_accounts_identity_immutable
BEFORE UPDATE OR DELETE ON "ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_account_identity();--> statement-breakpoint
CREATE FUNCTION enforce_wallet_identity() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Wallet identity is immutable'
			USING ERRCODE = '55000';
	END IF;

	IF OLD."id" IS DISTINCT FROM NEW."id"
		OR OLD."user_id" IS DISTINCT FROM NEW."user_id"
		OR OLD."product" IS DISTINCT FROM NEW."product"
		OR OLD."ledger_account_id" IS DISTINCT FROM NEW."ledger_account_id"
		OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
		RAISE EXCEPTION 'Wallet identity is immutable'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER wallets_identity_immutable
BEFORE UPDATE OR DELETE ON "wallets"
FOR EACH ROW EXECUTE FUNCTION enforce_wallet_identity();--> statement-breakpoint
CREATE FUNCTION enforce_entry_account_currency() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	account_currency text;
	transaction_currency text;
BEGIN
	SELECT a."currency", t."currency"
	INTO account_currency, transaction_currency
	FROM "ledger_accounts" a
	JOIN "transactions" t ON t."id" = NEW."transaction_id"
	WHERE a."id" = NEW."account_id";

	IF account_currency IS NULL OR transaction_currency IS NULL
		OR account_currency <> transaction_currency THEN
		RAISE EXCEPTION 'Ledger entry currency must match its account and transaction'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entry_account_currency_check
BEFORE INSERT ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION enforce_entry_account_currency();--> statement-breakpoint
CREATE FUNCTION assert_ledger_transaction_balanced(target_transaction_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	entry_count bigint;
	debit_total numeric;
	credit_total numeric;
BEGIN
	SELECT
		COUNT(*),
		COALESCE(SUM("amount") FILTER (WHERE "direction" = 'debit'), 0),
		COALESCE(SUM("amount") FILTER (WHERE "direction" = 'credit'), 0)
	INTO entry_count, debit_total, credit_total
	FROM "ledger_entries"
	WHERE "transaction_id" = target_transaction_id;

	IF entry_count < 2 OR debit_total <> credit_total THEN
		RAISE EXCEPTION 'Ledger transaction must have at least two balanced entries'
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
CREATE FUNCTION assert_ledger_account_balance(target_account_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	cached_balance bigint;
	derived_balance numeric;
	invalid_snapshot boolean;
BEGIN
	SELECT
		a."balance",
		COALESCE(SUM(CASE WHEN e."direction" = a."normal_side" THEN e."amount" ELSE -e."amount" END), 0)
	INTO cached_balance, derived_balance
	FROM "ledger_accounts" a
	LEFT JOIN "ledger_entries" e ON e."account_id" = a."id"
	WHERE a."id" = target_account_id
	GROUP BY a."id", a."balance", a."normal_side";

	SELECT EXISTS (
		SELECT 1
		FROM (
			SELECT
				e."balance_after",
				SUM(CASE WHEN e."direction" = a."normal_side" THEN e."amount" ELSE -e."amount" END)
					OVER (ORDER BY e."id" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS derived
			FROM "ledger_accounts" a
			JOIN "ledger_entries" e ON e."account_id" = a."id"
			WHERE a."id" = target_account_id
		) snapshots
		WHERE snapshots."balance_after" <> snapshots.derived
	)
	INTO invalid_snapshot;

	IF cached_balance IS NULL OR cached_balance <> derived_balance OR invalid_snapshot THEN
		RAISE EXCEPTION 'Ledger account balance does not match its entries'
			USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION validate_ledger_account_balance() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_account_balance(NEW."id");
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION validate_entry_account_balance() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_account_balance(NEW."account_id");
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_accounts_balance_constraint
AFTER INSERT OR UPDATE ON "ledger_accounts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_ledger_account_balance();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_account_balance_constraint
AFTER INSERT ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_entry_account_balance();--> statement-breakpoint
CREATE FUNCTION enforce_idempotency_completion() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "idempotency_keys"
		WHERE "scope" = NEW."scope"
			AND "key" = NEW."key"
			AND "transaction_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Idempotency key must reference a completed transaction'
			USING ERRCODE = '23514';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION enforce_idempotency_identity() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Idempotency records are immutable'
			USING ERRCODE = '55000';
	END IF;

	IF OLD."scope" IS DISTINCT FROM NEW."scope"
		OR OLD."key" IS DISTINCT FROM NEW."key"
		OR OLD."request_hash" IS DISTINCT FROM NEW."request_hash"
		OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
		OR (OLD."transaction_id" IS NOT NULL AND OLD."transaction_id" IS DISTINCT FROM NEW."transaction_id") THEN
		RAISE EXCEPTION 'Idempotency records are immutable'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER idempotency_keys_identity_immutable
BEFORE UPDATE OR DELETE ON "idempotency_keys"
FOR EACH ROW EXECUTE FUNCTION enforce_idempotency_identity();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER idempotency_keys_complete_constraint
AFTER INSERT OR UPDATE ON "idempotency_keys"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_idempotency_completion();