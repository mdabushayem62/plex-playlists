ALTER TABLE `job_runs` ADD `progress_current` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `job_runs` ADD `progress_total` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `job_runs` ADD `progress_message` text;