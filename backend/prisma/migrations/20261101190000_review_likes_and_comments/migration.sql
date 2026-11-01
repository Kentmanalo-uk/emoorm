-- Reviews become something other shoppers can act on: mark helpful, and
-- reply under. Three new tables only -- nothing existing is altered, so the
-- version still serving traffic is unaffected and there is nothing to
-- backfill.
--
-- review_comment_flags mirrors message_flags so one admin queue can read
-- both; it is separate rather than a nullable column on that table because
-- message_flags.message_id is live, NOT NULL and unique.

CREATE TABLE `review_likes` (
  `id` VARCHAR(191) NOT NULL,
  `review_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `review_likes_review_id_user_id_key`(`review_id`, `user_id`),
  INDEX `review_likes_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_comments` (
  `id` VARCHAR(191) NOT NULL,
  `review_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `flagged_at` DATETIME(3) NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `review_comments_review_id_deleted_at_created_at_idx`(`review_id`, `deleted_at`, `created_at`),
  INDEX `review_comments_user_id_created_at_idx`(`user_id`, `created_at`),
  INDEX `review_comments_flagged_at_idx`(`flagged_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_comment_flags` (
  `id` VARCHAR(191) NOT NULL,
  `comment_id` VARCHAR(191) NOT NULL,
  `review_id` VARCHAR(191) NOT NULL,
  `author_id` VARCHAR(191) NOT NULL,
  `matched` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'REVIEWED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
  `municipality_id` VARCHAR(191) NULL,
  `reviewed_by_id` VARCHAR(191) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `review_comment_flags_comment_id_key`(`comment_id`),
  INDEX `review_comment_flags_municipality_id_status_created_at_idx`(`municipality_id`, `status`, `created_at`),
  INDEX `review_comment_flags_author_id_idx`(`author_id`),
  INDEX `review_comment_flags_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `review_likes` ADD CONSTRAINT `review_likes_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_likes` ADD CONSTRAINT `review_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_comment_flags` ADD CONSTRAINT `review_comment_flags_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `review_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_comment_flags` ADD CONSTRAINT `review_comment_flags_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_comment_flags` ADD CONSTRAINT `review_comment_flags_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
