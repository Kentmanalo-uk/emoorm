-- Security counters kept across restarts (lib/securityCounters.js).
CREATE TABLE `security_counters` (
    `name` VARCHAR(191) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `data` JSON NULL,

    INDEX `security_counters_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
