CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`nickname` text DEFAULT '宝宝' NOT NULL,
	`avatar` text DEFAULT '😊' NOT NULL,
	`visible_metrics` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
