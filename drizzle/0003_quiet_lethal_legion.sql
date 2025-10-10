CREATE TABLE `setup_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`current_step` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`step_data` text,
	`created_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
