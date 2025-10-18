DROP INDEX IF EXISTS `settings_history_key_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `settings_history_changed_at_idx`;--> statement-breakpoint
CREATE INDEX `settings_history_key_idx` ON `settings_history` (`setting_key`);--> statement-breakpoint
CREATE INDEX `settings_history_changed_at_idx` ON `settings_history` (`changed_at`);