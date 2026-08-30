-- CreateTable
CREATE TABLE `addresses` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `contact_number` VARCHAR(191) NOT NULL,
    `municipality_id` VARCHAR(191) NOT NULL,
    `barangay` VARCHAR(191) NOT NULL,
    `street` TEXT NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: copy each user's existing flat address into a default saved address.
INSERT INTO `addresses` (`id`, `user_id`, `full_name`, `contact_number`, `municipality_id`, `barangay`, `street`, `is_default`, `created_at`, `updated_at`)
SELECT UUID(), `id`, `full_name`, COALESCE(`contact_number`, ''), `municipality_id`, `barangay`, `address`, true, NOW(3), NOW(3)
FROM `users`
WHERE `address` IS NOT NULL AND `address` != '' AND `barangay` IS NOT NULL AND `barangay` != '';
