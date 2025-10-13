CREATE TABLE `audio_features` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rating_key` text NOT NULL,
	`audiomuse_item_id` text,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`tempo` real,
	`key` text,
	`scale` text,
	`energy` real,
	`mood_vector` text,
	`other_features` text,
	`match_confidence` text DEFAULT 'exact',
	`source` text DEFAULT 'audiomuse',
	`cached_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_features_rating_key_unique` ON `audio_features` (`rating_key`);--> statement-breakpoint
CREATE INDEX `audio_features_audiomuse_id_idx` ON `audio_features` (`audiomuse_item_id`);--> statement-breakpoint
CREATE INDEX `audio_features_energy_idx` ON `audio_features` (`energy`);--> statement-breakpoint
CREATE INDEX `audio_features_tempo_idx` ON `audio_features` (`tempo`);--> statement-breakpoint
CREATE INDEX `audio_features_artist_idx` ON `audio_features` (`artist`);