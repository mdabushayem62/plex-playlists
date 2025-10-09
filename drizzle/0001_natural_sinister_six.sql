CREATE TABLE `genre_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_name` text NOT NULL,
	`genres` text NOT NULL,
	`source` text NOT NULL,
	`cached_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_cache_artist_unique` ON `genre_cache` (`artist_name`);