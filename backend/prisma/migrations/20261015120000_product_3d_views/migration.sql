-- 3D / AR product views: a seller picks a shape template (jar, bottle, box,
-- pouch), enters its real size and adds a label photo; their browser builds
-- the model (GLB for Android and the web, USDZ for iPhone AR). The files
-- live in /uploads; the product keeps their addresses and the template.
ALTER TABLE `products` ADD COLUMN `model_3d` JSON NULL;

-- The super admin's switch for the whole feature (off until turned on).
ALTER TABLE `app_settings` ADD COLUMN `product3d_enabled` BOOLEAN NOT NULL DEFAULT false;
