-- The photo a seller takes when handing an order over: proof of delivery
-- (delivery orders) or proof of pickup (pickup orders).
ALTER TABLE `orders` ADD COLUMN `fulfillment_proof_url` VARCHAR(191) NULL,
  ADD COLUMN `fulfillment_proof_at` DATETIME(3) NULL;
