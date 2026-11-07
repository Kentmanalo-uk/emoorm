-- The colour of the header bars on phones (and the status bar over them):
-- GLOW, the light pink-to-green wash they have now, WHITE or GREEN. A super
-- admin picks it.
--
-- Expand only: one column defaulting to the look the code already draws.

ALTER TABLE `app_settings`
  ADD COLUMN `mobile_header_style` VARCHAR(10) NOT NULL DEFAULT 'GLOW';
