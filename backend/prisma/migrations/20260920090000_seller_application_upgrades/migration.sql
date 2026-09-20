-- Seller application upgrades: shop location/branding, business identity,
-- payout + fulfillment intent, terms consent, review outcome, draft & history.

ALTER TABLE `users`
  ADD COLUMN `shop_municipality_id` VARCHAR(191) NULL,
  ADD COLUMN `shop_barangay` VARCHAR(191) NULL,
  ADD COLUMN `shop_tagline` VARCHAR(191) NULL,
  ADD COLUMN `shop_logo_url` VARCHAR(191) NULL,
  ADD COLUMN `shop_categories` JSON NULL,
  ADD COLUMN `seller_business_type` VARCHAR(191) NULL,
  ADD COLUMN `seller_permit_number` VARCHAR(191) NULL,
  ADD COLUMN `seller_permit_url` VARCHAR(191) NULL,
  ADD COLUMN `seller_bir_tin` VARCHAR(191) NULL,
  ADD COLUMN `payout_method` VARCHAR(191) NULL,
  ADD COLUMN `payout_account_name` VARCHAR(191) NULL,
  ADD COLUMN `payout_account_number` VARCHAR(191) NULL,
  ADD COLUMN `fulfillment_preference` VARCHAR(191) NULL,
  ADD COLUMN `seller_terms_version` VARCHAR(191) NULL,
  ADD COLUMN `seller_terms_accepted_at` DATETIME(3) NULL,
  ADD COLUMN `seller_rejection_reason` TEXT NULL,
  ADD COLUMN `seller_reviewed_by_id` VARCHAR(191) NULL,
  ADD COLUMN `seller_reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `seller_application_draft` JSON NULL,
  ADD COLUMN `seller_application_history` JSON NULL;

-- Existing approved sellers keep their shop municipality in sync with the
-- store that was already created for them.
UPDATE `users` u
  JOIN `stores` s ON s.`owner_id` = u.`id`
  SET u.`shop_municipality_id` = s.`municipality_id`
  WHERE u.`shop_municipality_id` IS NULL;
