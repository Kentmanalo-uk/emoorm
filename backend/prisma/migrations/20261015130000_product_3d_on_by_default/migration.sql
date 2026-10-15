-- 3D views of products are on by default: new settings rows start on, and
-- the existing row is switched on (the super admin can still turn it off).
ALTER TABLE `app_settings` ALTER COLUMN `product3d_enabled` SET DEFAULT true;
UPDATE `app_settings` SET `product3d_enabled` = true;
