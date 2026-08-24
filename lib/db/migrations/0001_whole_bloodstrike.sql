CREATE TABLE `user_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`bio` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
