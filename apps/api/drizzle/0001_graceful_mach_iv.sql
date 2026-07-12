CREATE TABLE "archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_ids" uuid[] NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"output_object_key" text,
	"output_byte_size" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "detected_source_format" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "output_mime_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "output_byte_size" integer;--> statement-breakpoint
CREATE INDEX "archives_status_created_at_idx" ON "archives" USING btree ("status","created_at");