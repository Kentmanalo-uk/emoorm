-- Livestock is sold by talking it over in chat: offers go back and forth
-- without a limit, an agreed price leads to a meetup, and the seller records
-- what was agreed in person (the buyer confirms it, or it confirms itself).
ALTER TABLE `price_offers` MODIFY `status` ENUM('PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING', 'SOLD', 'DECLINED', 'CANCELLED', 'EXPIRED', 'USED') NOT NULL DEFAULT 'PENDING';
UPDATE `price_offers` SET `status` = 'SOLD' WHERE `status` = 'USED';
ALTER TABLE `price_offers` MODIFY `status` ENUM('PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING', 'SOLD', 'DECLINED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING';

ALTER TABLE `price_offers` ADD COLUMN `rounds` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `final_quantity` INTEGER NULL,
    ADD COLUMN `final_total` DECIMAL(10, 2) NULL,
    ADD COLUMN `meet_at` DATETIME(3) NULL,
    ADD COLUMN `meet_place` VARCHAR(200) NULL,
    ADD COLUMN `closed_reason` VARCHAR(40) NULL,
    ADD COLUMN `closed_by` VARCHAR(10) NULL;

CREATE INDEX `price_offers_status_updated_idx` ON `price_offers`(`status`, `updated_at`);

ALTER TABLE `messages` ADD COLUMN `offer_event` VARCHAR(20) NULL;

-- Every livestock listing takes offers; there is no hidden lowest price.
ALTER TABLE `products` DROP COLUMN `accepts_offers`,
    DROP COLUMN `offer_floor`;
