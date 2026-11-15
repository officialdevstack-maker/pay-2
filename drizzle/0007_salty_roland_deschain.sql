CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'card' NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_kind_chk" CHECK ("payment_methods"."kind" in ('card')),
	CONSTRAINT "payment_methods_brand_chk" CHECK ("payment_methods"."brand" in ('visa', 'mastercard', 'verve')),
	CONSTRAINT "payment_methods_last4_chk" CHECK ("payment_methods"."last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "payment_methods_exp_chk" CHECK ("payment_methods"."exp_month" between 1 and 12 and "payment_methods"."exp_year" between 2000 and 2100),
	CONSTRAINT "payment_methods_status_chk" CHECK ("payment_methods"."status" in ('active', 'needs_attention'))
);
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_pay_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pay_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_user_token_uq" ON "payment_methods" USING btree ("user_id","token");--> statement-breakpoint
CREATE INDEX "payment_methods_user_idx" ON "payment_methods" USING btree ("user_id");