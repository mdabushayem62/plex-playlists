CREATE TABLE `settings_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`setting_key` text NOT NULL,
	`old_value` text,
	`new_value` text NOT NULL,
	`changed_by` text DEFAULT 'web_ui' NOT NULL,
	`changed_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_history_key_idx` ON `settings_history` (`setting_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_history_changed_at_idx` ON `settings_history` (`changed_at`);