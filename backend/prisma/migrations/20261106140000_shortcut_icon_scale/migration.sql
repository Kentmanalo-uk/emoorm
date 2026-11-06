-- How large the shortcut marks are drawn (Home's shortcuts, the seller's
-- tools), as a percentage of their standard size: 100 is the size they
-- have now. A super admin picks it beside the icon style.
--
-- Expand only: one column defaulting to the size the code already draws.

ALTER TABLE `app_settings`
  ADD COLUMN `shortcut_icon_scale` INT NOT NULL DEFAULT 100;
