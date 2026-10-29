-- A town office's contact, who handles a help case, and banner dates.
ALTER TABLE `municipalities`
    ADD COLUMN `office_address` VARCHAR(300) NULL,
    ADD COLUMN `office_hours` VARCHAR(200) NULL,
    ADD COLUMN `office_phone` VARCHAR(40) NULL,
    ADD COLUMN `office_email` VARCHAR(160) NULL;

ALTER TABLE `support_conversations`
    ADD COLUMN `assigned_to_id` VARCHAR(191) NULL,
    ADD COLUMN `assigned_at` DATETIME(3) NULL;

ALTER TABLE `banners`
    ADD COLUMN `starts_at` DATETIME(3) NULL,
    ADD COLUMN `ends_at` DATETIME(3) NULL;
