CREATE TABLE `track_cache` (
	`rating_key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist_name` text NOT NULL,
	`album_name` text,
	`duration` integer,
	`year` integer,
	`track_index` integer,
	`parent_rating_key` text,
	`grandparent_rating_key` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`moods` text DEFAULT '[]' NOT NULL,
	`static_cached_at` integer NOT NULL,
	`static_expires_at` integer NOT NULL,
	`user_rating` real,
	`view_count` integer DEFAULT 0,
	`skip_count` integer DEFAULT 0,
	`last_viewed_at` integer,
	`stats_cached_at` integer NOT NULL,
	`stats_expires_at` integer NOT NULL,
	`quality_score` real,
	`is_high_rated` integer,
	`is_unplayed` integer,
	`is_unrated` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `track_cache_artist_idx` ON `track_cache` (`artist_name`);--> statement-breakpoint
CREATE INDEX `track_cache_album_idx` ON `track_cache` (`album_name`);--> statement-breakpoint
CREATE INDEX `track_cache_rating_idx` ON `track_cache` (`user_rating`);--> statement-breakpoint
CREATE INDEX `track_cache_quality_idx` ON `track_cache` (`quality_score`);--> statement-breakpoint
CREATE INDEX `track_cache_last_viewed_idx` ON `track_cache` (`last_viewed_at`);--> statement-breakpoint
CREATE INDEX `track_cache_high_rated_idx` ON `track_cache` (`is_high_rated`);--> statement-breakpoint
CREATE INDEX `track_cache_unplayed_idx` ON `track_cache` (`is_unplayed`);--> statement-breakpoint
CREATE INDEX `track_cache_static_expires_idx` ON `track_cache` (`static_expires_at`);--> statement-breakpoint
CREATE INDEX `track_cache_stats_expires_idx` ON `track_cache` (`stats_expires_at`);