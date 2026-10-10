-- MoorMove free-delivery promos. An order placed while MoorMove ran a promo
-- for it costs the buyer no delivery fee; it keeps the promo's MoorMove id and
-- title (so the seller's rider booking sends it, and buyer and seller are told).
-- A rider booking keeps the usual fee (list_fee) and the promo's title.

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `delivery_promo_id` VARCHAR(64) NULL,
    ADD COLUMN `delivery_promo_title` VARCHAR(80) NULL;

-- AlterTable
ALTER TABLE `rider_deliveries` ADD COLUMN `list_fee` DECIMAL(10, 2) NULL,
    ADD COLUMN `promo_title` VARCHAR(80) NULL;
