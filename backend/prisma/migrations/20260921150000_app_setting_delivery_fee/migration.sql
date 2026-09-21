-- Platform delivery fee and free-delivery threshold.
--
-- Defaults match the rule that was previously hardcoded in the order service
-- and in two web pages (PHP 50 below PHP 500), so deploying this changes no
-- quote until a super admin edits the values in Settings.
ALTER TABLE `app_settings`
  ADD COLUMN `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 50,
  ADD COLUMN `free_delivery_threshold` DECIMAL(10, 2) NOT NULL DEFAULT 500;
