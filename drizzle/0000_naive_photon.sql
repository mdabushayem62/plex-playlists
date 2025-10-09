CREATE TABLE `history_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plex_rating_key` text NOT NULL,
	`window` text NOT NULL,
	`last_played_at` integer,
	`play_count_30d` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer DEFAULT (strftime('%s','now')*1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_rating_window_unique` ON `history_cache` (`plex_rating_key`,`window`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`window` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`playlist_id` integer NOT NULL,
	`plex_rating_key` text NOT NULL,
	`title` text,
	`artist` text,
	`album` text,
	`position` integer NOT NULL,
	`score` real,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`window` text NOT NULL,
	`plex_rating_key` text,
	`title` text,
	`description` text,
	`generated_at` integer NOT NULL,
	`track_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlists_window_unique` ON `playlists` (`window`);