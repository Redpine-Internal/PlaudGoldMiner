CREATE TABLE `content_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`conversation_id` text,
	`excerpt` text,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_sources_content_idx` ON `content_sources` (`content_id`);--> statement-breakpoint
CREATE INDEX `content_sources_conversation_idx` ON `content_sources` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`platform` text NOT NULL,
	`theme` text NOT NULL,
	`outline` text,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`relevance_score` real NOT NULL,
	`status` text DEFAULT 'sugerido' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contents_status_idx` ON `contents` (`status`);--> statement-breakpoint
CREATE INDEX `contents_platform_idx` ON `contents` (`platform`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` integer NOT NULL,
	`duration` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`transcription` text,
	`summary` text,
	`topics` text,
	`participants` text,
	`tags` text,
	`source` text NOT NULL,
	`source_file_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_status_idx` ON `conversations` (`status`);--> statement-breakpoint
CREATE INDEX `conversations_type_idx` ON `conversations` (`type`);--> statement-breakpoint
CREATE INDEX `conversations_date_idx` ON `conversations` (`date`);--> statement-breakpoint
CREATE TABLE `cross_insight_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`cross_insight_id` text,
	`conversation_id` text,
	`relevance` text,
	FOREIGN KEY (`cross_insight_id`) REFERENCES `cross_insights`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cross_insight_conv_insight_idx` ON `cross_insight_conversations` (`cross_insight_id`);--> statement-breakpoint
CREATE INDEX `cross_insight_conv_conversation_idx` ON `cross_insight_conversations` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `cross_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`pattern` text NOT NULL,
	`conversation_ids` text,
	`insight_type` text NOT NULL,
	`confidence` real NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`action_suggestion` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cross_insights_status_idx` ON `cross_insights` (`status`);--> statement-breakpoint
CREATE INDEX `cross_insights_type_idx` ON `cross_insights` (`insight_type`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`title` text NOT NULL,
	`pain` text NOT NULL,
	`context` text,
	`score` real NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'nova' NOT NULL,
	`notes` text,
	`tags` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opportunities_conversation_idx` ON `opportunities` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `opportunities_status_idx` ON `opportunities` (`status`);