-- Sign-in methods a super admin can switch on or off: Continue with Google,
-- with Facebook (both on, as they are now) and with a mobile number (off
-- until switched on). Email sign-in always stays on.
--
-- Expand only: three columns with those defaults.

ALTER TABLE `app_settings`
  ADD COLUMN `login_google` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `login_facebook` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `login_phone` BOOLEAN NOT NULL DEFAULT false;
