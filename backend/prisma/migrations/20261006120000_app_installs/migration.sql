-- The Android app's installs (reported by the site inside the app) and the
-- APK's downloads per version and day.
CREATE TABLE `app_installs` (
    `id` VARCHAR(64) NOT NULL,
    `version` VARCHAR(20) NOT NULL,
    `device` VARCHAR(120) NULL,
    `android` VARCHAR(20) NULL,
    `user_id` VARCHAR(191) NULL,
    `opens` INTEGER NOT NULL DEFAULT 1,
    `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_installs_last_seen_idx`(`last_seen_at`),
    INDEX `app_installs_user_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_downloads` (
    `version` VARCHAR(20) NOT NULL,
    `day` DATE NOT NULL,
    `downloads` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`version`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `app_installs` ADD CONSTRAINT `app_installs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
