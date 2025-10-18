CREATE TABLE `listening_history_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rating_key` text NOT NULL,
	`viewed_at` integer NOT NULL,
	`account_id` integer,
	`title` text NOT NULL,
	`artist_name` text NOT NULL,
	`album_name` text,
	`metadata` text NOT NULL,
	`cached_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listening_history_unique_play` ON `listening_history_cache` (`rating_key`,`viewed_at`);--> statement-breakpoint
CREATE INDEX `listening_history_viewed_at_idx` ON `listening_history_cache` (`viewed_at`);--> statement-breakpoint
CREATE INDEX `listening_history_rating_key_idx` ON `listening_history_cache` (`rating_key`);--> statement-breakpoint
CREATE INDEX `listening_history_artist_idx` ON `listening_history_cache` (`artist_name`);