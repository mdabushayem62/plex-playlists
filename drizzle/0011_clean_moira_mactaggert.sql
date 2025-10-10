CREATE TABLE `custom_playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`genres` text DEFAULT '[]' NOT NULL,
	`moods` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`cron` text,
	`target_size` integer DEFAULT 50,
	`description` text,
	`created_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_playlists_name_unique` ON `custom_playlists` (`name`);