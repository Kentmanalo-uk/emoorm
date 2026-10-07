-- A town's admin team: who added each admin, when an account was last
-- active, and how many admins a team may have.
ALTER TABLE `app_settings` ADD COLUMN `admin_team_max` INTEGER NOT NULL DEFAULT 5;

ALTER TABLE `users` ADD COLUMN `admin_added_by_id` VARCHAR(191) NULL,
    ADD COLUMN `last_active_at` DATETIME(3) NULL;

ALTER TABLE `users` ADD CONSTRAINT `users_admin_added_by_id_fkey` FOREIGN KEY (`admin_added_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
