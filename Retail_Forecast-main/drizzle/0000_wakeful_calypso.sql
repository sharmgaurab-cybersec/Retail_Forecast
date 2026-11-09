CREATE TABLE `saved_deals` (
	`user_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `deal_id`)
);
