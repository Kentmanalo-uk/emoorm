-- The seller application can carry the shop's cover photo (next to the logo
-- it already had), several ways buyers pay, e.g. ["GCASH","COD_ONLY"]
-- (payout_method stays the main one for older readers), and an optional
-- GCash / QR Ph code with its kind, which becomes the shop's payment QR.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `shop_cover_url` VARCHAR(191) NULL,
    ADD COLUMN `payout_methods` JSON NULL,
    ADD COLUMN `payout_qr_url` VARCHAR(191) NULL,
    ADD COLUMN `payout_qr_type` VARCHAR(191) NULL;
