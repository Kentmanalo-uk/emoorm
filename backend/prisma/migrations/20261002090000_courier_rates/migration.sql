-- Courier fees by weight: products carry their packed weight, couriers a
-- rate table, and an order the weight its courier fee was priced on.
ALTER TABLE `products` ADD COLUMN `weight_grams` INTEGER NULL;
ALTER TABLE `couriers` ADD COLUMN `rates` JSON NULL;
ALTER TABLE `orders` ADD COLUMN `shipping_weight_grams` INTEGER NULL;

-- The couriers' own logos (served with the web app), where none was set.
UPDATE `couriers` SET `logo_url` = '/couriers/jt-express.png' WHERE `name` = 'J&T Express' AND `logo_url` IS NULL;
UPDATE `couriers` SET `logo_url` = '/couriers/lbc.png' WHERE `name` = 'LBC' AND `logo_url` IS NULL;
UPDATE `couriers` SET `logo_url` = '/couriers/flash-express.png' WHERE `name` = 'Flash Express' AND `logo_url` IS NULL;
UPDATE `couriers` SET `logo_url` = '/couriers/jrs-express.png' WHERE `name` = 'JRS Express' AND `logo_url` IS NULL;
UPDATE `couriers` SET `logo_url` = '/couriers/2go-express.png' WHERE `name` = '2GO Express' AND `logo_url` IS NULL;
UPDATE `couriers` SET `logo_url` = '/couriers/ninja-van.png' WHERE `name` = 'Ninja Van' AND `logo_url` IS NULL;

-- J&T Express's published rate card, Luzon to Luzon (January 2025). It
-- prices by weight and region, not by town, so both columns match. Parcels
-- over 6 kg are priced at the branch, so none is quoted here.
UPDATE `couriers` SET `rates` = JSON_OBJECT(
  'brackets', JSON_ARRAY(
    JSON_OBJECT('upToKg', 0.5, 'sameTown', 85, 'otherTown', 85),
    JSON_OBJECT('upToKg', 1, 'sameTown', 155, 'otherTown', 155),
    JSON_OBJECT('upToKg', 3, 'sameTown', 180, 'otherTown', 180),
    JSON_OBJECT('upToKg', 4, 'sameTown', 270, 'otherTown', 270),
    JSON_OBJECT('upToKg', 5, 'sameTown', 360, 'otherTown', 360),
    JSON_OBJECT('upToKg', 6, 'sameTown', 455, 'otherTown', 455)
  ),
  'extraPerKg', NULL,
  'source', 'J&T Express rate card, Luzon to Luzon',
  'asOf', '2025-01'
) WHERE `name` = 'J&T Express' AND `rates` IS NULL;
