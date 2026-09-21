-- Superadmin-controlled colour palette.
--
-- Nullable with no default: an existing row keeps NULL and the application
-- renders the palette it always did, so deploying this changes nothing until
-- somebody chooses a theme in Settings.
ALTER TABLE `app_settings` ADD COLUMN `theme` JSON NULL;
