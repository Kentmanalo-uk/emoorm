-- Hold a candidate MFA secret separately from the live one.
--
-- beginSetup() used to overwrite mfa_secret and set mfa_enabled = 0 straight
-- away, so merely starting enrolment disabled the account's second factor,
-- and anyone holding a session could silently swap in their own authenticator.
-- The live secret is now untouched until a code from the new device is
-- confirmed by completeSetup().
ALTER TABLE `users` ADD COLUMN `mfa_pending_secret` TEXT NULL;
