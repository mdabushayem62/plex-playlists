-- Add popularity column to artist_cache
ALTER TABLE `artist_cache` ADD `popularity` integer;--> statement-breakpoint

-- Add isrc column to track_cache
ALTER TABLE `track_cache` ADD `isrc` text;
