CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`price_cents` integer,
	`observed_at` text NOT NULL,
	`method` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_events` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL
);
