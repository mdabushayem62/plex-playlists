CREATE TABLE `adaptive_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`play_queue_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`action_data` text,
	`reason` text,
	`tracks_affected` integer,
	`created_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `adaptive_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adaptive_actions_session_idx` ON `adaptive_actions` (`session_id`);--> statement-breakpoint
CREATE INDEX `adaptive_actions_created_at_idx` ON `adaptive_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `adaptive_completion_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`track_rating_key` text NOT NULL,
	`track_title` text NOT NULL,
	`genres` text,
	`artists` text,
	`completed_at` integer NOT NULL,
	`listen_duration_ms` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `adaptive_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adaptive_completion_events_session_idx` ON `adaptive_completion_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `adaptive_completion_events_completed_at_idx` ON `adaptive_completion_events` (`completed_at`);--> statement-breakpoint
CREATE TABLE `adaptive_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`machine_identifier` text NOT NULL,
	`play_queue_id` integer,
	`playlist_id` integer,
	`created_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_sessions_machine_identifier_unique` ON `adaptive_sessions` (`machine_identifier`);--> statement-breakpoint
CREATE TABLE `adaptive_skip_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`track_rating_key` text NOT NULL,
	`track_title` text NOT NULL,
	`genres` text,
	`artists` text,
	`skipped_at` integer NOT NULL,
	`listen_duration_ms` integer NOT NULL,
	`completion_percent` real NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `adaptive_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adaptive_skip_events_session_idx` ON `adaptive_skip_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `adaptive_skip_events_skipped_at_idx` ON `adaptive_skip_events` (`skipped_at`);