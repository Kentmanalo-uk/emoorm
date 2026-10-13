-- MoorMove rider orders: a failed delivery's parcel comes back to the shop
-- (rider_deliveries.status RETURNING until the seller confirms it, then
-- returned_at), and an order the shop took over from a rider says when.

-- AlterTable
ALTER TABLE `rider_deliveries` ADD COLUMN `returned_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `rider_fallback_at` DATETIME(3) NULL;
