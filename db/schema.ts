import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const healthEntries = sqliteTable("health_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default("local-user"),
  type: text("type", { enum: ["sleep", "meal", "exercise", "water", "smoking", "alcohol"] }).notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  note: text("note").notNull().default(""),
  recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_health_entries_user_recorded").on(table.userId, table.recordedAt)]);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  nickname: text("nickname").notNull().default("宝宝"),
  avatar: text("avatar").notNull().default("😊"),
  visibleMetrics: text("visible_metrics").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
