CREATE TABLE `health_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'local-user' NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_health_entries_user_recorded` ON `health_entries` (`user_id`,`recorded_at`);