CREATE TYPE "public"."compression_preset" AS ENUM('high_quality', 'balanced', 'small_file', 'custom');--> statement-breakpoint
CREATE TYPE "public"."job_operation" AS ENUM('convert', 'compress');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "resolved_target_format" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "operation" "job_operation" DEFAULT 'convert' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "compression_preset" "compression_preset";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "resize_width" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "resize_height" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "kept_original" boolean DEFAULT false NOT NULL;