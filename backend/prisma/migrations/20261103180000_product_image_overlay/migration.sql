-- A product photo's overlay: one of the shop-branding designs drawn over
-- the photo when it is shown (the shop's logo, name and colour), never baked
-- into the picture. Null: off. The designs live in the clients
-- (web/src/lib/imageOverlays.js, mobile/src/lib/imageOverlays.js).
--
-- Expand only: a nullable column nothing reads yet.

ALTER TABLE `products`
  ADD COLUMN `image_overlay` VARCHAR(32) NULL;
