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
  "expired",
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
    detectedSourceFormat: text("detected_source_format"),
    targetFormat: text("target_format").notNull(),
    quality: integer("quality").notNull(),
    scale: real("scale").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    outputObjectKey: text("output_object_key"),
    outputMimeType: text("output_mime_type"),
    outputByteSize: integer("output_byte_size"),
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

export const archives = pgTable(
  "archives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobIds: uuid("job_ids").array().notNull(),
    status: jobStatus("status").notNull().default("queued"),
    outputObjectKey: text("output_object_key"),
    outputByteSize: integer("output_byte_size"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("archives_status_created_at_idx").on(table.status, table.createdAt)],
);

export type ConversionJob = typeof jobs.$inferSelect;
export type ArchiveJob = typeof archives.$inferSelect;
