ALTER TABLE "pay_users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "pay_users_email_hash_idx" ON "pay_users" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "pay_users_phone_hash_idx" ON "pay_users" USING btree ("phone_hash");--> statement-breakpoint
ALTER TABLE "pay_users" ADD CONSTRAINT "pay_users_email_hash_chk" CHECK ("pay_users"."email_hash" is null or "pay_users"."email_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "pay_users" ADD CONSTRAINT "pay_users_phone_hash_chk" CHECK ("pay_users"."phone_hash" is null or "pay_users"."phone_hash" ~ '^[a-f0-9]{64}$');