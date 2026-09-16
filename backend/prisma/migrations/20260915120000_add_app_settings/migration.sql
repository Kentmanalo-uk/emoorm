CREATE TABLE `app_settings` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'global',
  `app_logo` VARCHAR(191) NOT NULL DEFAULT '/brand-icon.png',
  `product_placeholder` VARCHAR(191) NOT NULL DEFAULT '/brand-icon.png',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `app_settings` (`id`, `updated_at`)
VALUES ('global', CURRENT_TIMESTAMP(3));