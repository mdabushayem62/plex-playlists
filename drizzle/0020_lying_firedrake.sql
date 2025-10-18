CREATE TABLE `user_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hourly_genre_preferences` text NOT NULL,
	`peak_hours` text NOT NULL,
	`sessions_analyzed` integer NOT NULL,
	`analyzed_from` integer NOT NULL,
	`analyzed_to` integer NOT NULL,
	`last_analyzed` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`expires_at` integer NOT NULL
);
