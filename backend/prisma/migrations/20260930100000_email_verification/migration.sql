-- Email confirmation: the link in the welcome email carries a token, kept
-- hashed (SHA-256) with its expiry until the account confirms its email.
ALTER TABLE `users`
  ADD COLUMN `email_verification_token` VARCHAR(191) NULL,
  ADD COLUMN `email_verification_expiry` DATETIME(3) NULL;
