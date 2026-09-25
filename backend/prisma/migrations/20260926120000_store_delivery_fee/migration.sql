-- Sellers set their own delivery fee. Null keeps the platform default, so
-- existing stores charge exactly what they did before this migration.
ALTER TABLE `stores` ADD COLUMN `delivery_fee` DECIMAL(10, 2) NULL;
