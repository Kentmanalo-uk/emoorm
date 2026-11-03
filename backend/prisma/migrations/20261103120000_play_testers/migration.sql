-- The early version on Google Play: people who left their Gmail on the /app
-- page to be added to the Play Console tester list. added_at is set when a
-- super admin has added them (and they were emailed the link to join).
--
-- Expand only: a new table that nothing reads yet.

CREATE TABLE `play_testers` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `added_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `play_testers_email_key`(`email`),
  INDEX `play_testers_user_idx`(`user_id`),
  INDEX `play_testers_created_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `play_testers`
  ADD CONSTRAINT `play_testers_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
