import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inputObjectKey: text("input_object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sourceFormat: text("source_format").notNull(),
    targetFormat: text("target_format").notNull(),
    quality: integer("quality").notNull(),
    scale: real("scale").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    outputObjectKey: text("output_object_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("jobs_status_created_at_idx").on(table.status, table.createdAt),
    index("jobs_input_object_key_idx").on(table.inputObjectKey),
  ],
);

export type ConversionJob = typeof jobs.$inferSelect;
