-- The delivery address's map pin, copied onto the order for the rider.
ALTER TABLE `orders`
  ADD COLUMN `delivery_latitude` DOUBLE NULL,
  ADD COLUMN `delivery_longitude` DOUBLE NULL;
