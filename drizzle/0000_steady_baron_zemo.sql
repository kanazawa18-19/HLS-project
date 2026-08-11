CREATE TABLE `facilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facilities_name_unique` ON `facilities` (`name`);--> statement-breakpoint
CREATE TABLE `knowledge_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`has_content` integer DEFAULT false NOT NULL,
	`ota_id` integer,
	`facility_id` integer,
	`category` text,
	`tags` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`source_url` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`ota_id`) REFERENCES `otas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_entries_source_id_unique` ON `knowledge_entries` (`source_id`);--> statement-breakpoint
CREATE INDEX `knowledge_entries_ota_id_idx` ON `knowledge_entries` (`ota_id`);--> statement-breakpoint
CREATE INDEX `knowledge_entries_facility_id_idx` ON `knowledge_entries` (`facility_id`);--> statement-breakpoint
CREATE INDEX `knowledge_entries_category_idx` ON `knowledge_entries` (`category`);--> statement-breakpoint
CREATE TABLE `otas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'その他' NOT NULL,
	`admin_url` text,
	`help_url` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otas_name_unique` ON `otas` (`name`);