CREATE TABLE `album_genre_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_name` text NOT NULL,
	`album_name` text NOT NULL,
	`genres` text NOT NULL,
	`source` text NOT NULL,
	`cached_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `album_genre_cache_album_unique` ON `album_genre_cache` (`artist_name`,`album_name`);