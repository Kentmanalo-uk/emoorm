CREATE TABLE `support_tickets` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `type` ENUM('CUSTOMER_CARE', 'FEEDBACK') NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `rating` INT NULL,
  `status` ENUM('OPEN', 'IN_REVIEW', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `support_tickets_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `support_tickets_type_status_idx` (`type`, `status`),
  CONSTRAINT `support_tickets_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;