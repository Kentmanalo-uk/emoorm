-- Super-admin switch for the buyer ID-verification checkout gate.
--
-- Defaults to on, which is what the application enforced before this column
-- existed, so deploying it changes nothing until somebody turns it off.
ALTER TABLE `app_settings`
  ADD COLUMN `require_buyer_verification` BOOLEAN NOT NULL DEFAULT true;
