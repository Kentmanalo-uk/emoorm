-- Delivery by the shop is now priced by distance: a starting fee that covers
-- the first few km by road (from the shop's pin to the buyer's), then a fee
-- for each km after, or free. Service areas still say WHERE a shop delivers;
-- their old fees (and stores.delivery_fee) are kept but only price a shop
-- that has no pin yet. Orders keep the distance they were priced on.

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `delivery_fee_mode` ENUM('FREE', 'PER_KM') NOT NULL DEFAULT 'PER_KM',
    ADD COLUMN `delivery_base_fee` DECIMAL(10, 2) NULL,
    ADD COLUMN `delivery_included_km` DECIMAL(6, 2) NULL,
    ADD COLUMN `delivery_per_km` DECIMAL(10, 2) NULL,
    ADD COLUMN `delivery_max_km` DECIMAL(6, 2) NULL;

-- AlterTable
ALTER TABLE `app_settings` ADD COLUMN `delivery_per_km` DECIMAL(10, 2) NOT NULL DEFAULT 10,
    ADD COLUMN `delivery_included_km` DECIMAL(6, 2) NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `delivery_distance_km` DECIMAL(6, 2) NULL,
    ADD COLUMN `delivery_distance_source` VARCHAR(10) NULL;

-- Existing shops. Free delivery stays free: the shop's fee is 0 and no area
-- charges more, or every area it delivers to is priced at 0.
UPDATE `stores` s SET s.`delivery_fee_mode` = 'FREE'
WHERE (s.`delivery_fee` = 0
       AND NOT EXISTS (SELECT 1 FROM `store_service_areas` a WHERE a.`store_id` = s.`id` AND a.`fee` > 0))
   OR (EXISTS (SELECT 1 FROM `store_service_areas` a WHERE a.`store_id` = s.`id`)
       AND NOT EXISTS (SELECT 1 FROM `store_service_areas` a WHERE a.`store_id` = s.`id` AND (a.`fee` IS NULL OR a.`fee` > 0)));

-- Everyone else goes by distance, starting from the fee they charged: the
-- most common fee of their places when they priced each place, else their
-- one fee. Neither: blank, so the platform's starting fee applies. The km
-- settings stay blank (the platform's).
UPDATE `stores` s SET s.`delivery_base_fee` = (
    SELECT a.`fee` FROM `store_service_areas` a
    WHERE a.`store_id` = s.`id` AND a.`fee` IS NOT NULL
    GROUP BY a.`fee`
    ORDER BY COUNT(*) DESC, a.`fee` ASC
    LIMIT 1
)
WHERE s.`delivery_fee_mode` = 'PER_KM';

UPDATE `stores` s SET s.`delivery_base_fee` = s.`delivery_fee`
WHERE s.`delivery_fee_mode` = 'PER_KM' AND s.`delivery_base_fee` IS NULL AND s.`delivery_fee` IS NOT NULL;
