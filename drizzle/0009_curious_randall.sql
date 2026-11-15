CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "checkout_attempts_method_chk" CHECK ("checkout_attempts"."method" in ('wallet', 'card', 'bank_transfer')),
	CONSTRAINT "checkout_attempts_status_chk" CHECK ("checkout_attempts"."status" in ('pending', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "checkout_attempts_hash_chk" CHECK ("checkout_attempts"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "checkout_attempts_resolved_chk" CHECK (("checkout_attempts"."status" in ('pending', 'unknown')) = ("checkout_attempts"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "checkout_sessions_status_chk";--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_session_id_checkout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_session_key_uq" ON "checkout_attempts" USING btree ("session_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_active_uq" ON "checkout_attempts" USING btree ("session_id") WHERE "checkout_attempts"."status" in ('pending', 'unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_succeeded_uq" ON "checkout_attempts" USING btree ("session_id") WHERE "checkout_attempts"."status" = 'succeeded';--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_status_chk" CHECK ("checkout_sessions"."status" in ('open', 'paid', 'cancelled', 'expired'));--> statement-breakpoint
CREATE FUNCTION enforce_checkout_session_binding() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."user_id" IS NOT NULL AND OLD."user_id" IS DISTINCT FROM NEW."user_id" THEN
        RAISE EXCEPTION 'Checkout session customer binding is immutable'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER checkout_sessions_binding_immutable
BEFORE UPDATE ON "checkout_sessions"
FOR EACH ROW EXECUTE FUNCTION enforce_checkout_session_binding();--> statement-breakpoint
CREATE FUNCTION enforce_checkout_attempt_rules() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    session_user_id uuid;
    session_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT "user_id" INTO session_user_id
        FROM "checkout_sessions" WHERE "id" = NEW."session_id";
        IF session_user_id IS NULL OR session_user_id <> NEW."user_id" THEN
            RAISE EXCEPTION 'Checkout attempt must belong to the session customer'
                USING ERRCODE = '23514';
        END IF;
        IF NEW."status" <> 'pending' THEN
            RAISE EXCEPTION 'Checkout attempts must begin in pending status'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Checkout attempts are immutable'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."session_id" IS DISTINCT FROM NEW."session_id"
        OR OLD."user_id" IS DISTINCT FROM NEW."user_id"
        OR OLD."method" IS DISTINCT FROM NEW."method"
        OR OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
        OR OLD."request_hash" IS DISTINCT FROM NEW."request_hash"
        OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
        RAISE EXCEPTION 'Checkout attempt identity is immutable'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."status" IN ('succeeded', 'failed')
        AND (OLD."status" IS DISTINCT FROM NEW."status"
            OR OLD."resolved_at" IS DISTINCT FROM NEW."resolved_at"
            OR OLD."failure_code" IS DISTINCT FROM NEW."failure_code") THEN
        RAISE EXCEPTION 'A resolved checkout attempt is immutable'
            USING ERRCODE = '55000';
    END IF;

    IF (OLD."status" = 'pending' AND NEW."status" NOT IN ('pending', 'unknown'))
        OR (OLD."status" = 'unknown' AND NEW."status" NOT IN ('unknown', 'succeeded', 'failed')) THEN
        RAISE EXCEPTION 'Invalid checkout attempt status transition'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."status" = 'succeeded' THEN
        SELECT "status" INTO session_status
        FROM "checkout_sessions" WHERE "id" = NEW."session_id";
        IF session_status IS DISTINCT FROM 'paid' THEN
            RAISE EXCEPTION 'A checkout attempt can succeed only after session settlement'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER checkout_attempts_rules
BEFORE INSERT OR UPDATE OR DELETE ON "checkout_attempts"
FOR EACH ROW EXECUTE FUNCTION enforce_checkout_attempt_rules();