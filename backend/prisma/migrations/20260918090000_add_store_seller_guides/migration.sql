-- Seller Center tutorial progress, stored per shop so it follows the seller across devices.
ALTER TABLE `stores` ADD COLUMN `seller_guides` JSON NULL;

-- Existing shops were created before this change: do not show them the tutorials.
UPDATE `stores` SET `seller_guides` = JSON_OBJECT('all', true);
