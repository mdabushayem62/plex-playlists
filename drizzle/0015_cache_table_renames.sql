-- Rename genre_cache to artist_cache
ALTER TABLE `genre_cache` RENAME TO `artist_cache`;--> statement-breakpoint

-- Add spotify_artist_id column to artist_cache
ALTER TABLE `artist_cache` ADD `spotify_artist_id` text;--> statement-breakpoint

-- Create index on spotify_artist_id
CREATE INDEX `artist_cache_spotify_id_idx` ON `artist_cache` (`spotify_artist_id`);--> statement-breakpoint

-- Rename album_genre_cache to album_cache
ALTER TABLE `album_genre_cache` RENAME TO `album_cache`;--> statement-breakpoint

-- Rename indexes for artist_cache (SQLite doesn't rename indexes automatically)
DROP INDEX IF EXISTS `genre_cache_artist_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `artist_cache_artist_unique` ON `artist_cache` (`artist_name`);--> statement-breakpoint

-- Rename indexes for album_cache
DROP INDEX IF EXISTS `album_genre_cache_album_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `album_cache_album_unique` ON `album_cache` (`artist_name`, `album_name`);
