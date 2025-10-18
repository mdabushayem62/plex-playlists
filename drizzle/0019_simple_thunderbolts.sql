CREATE TABLE `genre_similarity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`genre1` text NOT NULL,
	`genre2` text NOT NULL,
	`is_similar` integer NOT NULL,
	`cached_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_similarity_pair_unique` ON `genre_similarity` (`genre1`,`genre2`);