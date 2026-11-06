-- How the shortcut marks are drawn (Home's shortcuts, the seller's tools):
-- GLASS (coloured glass, the look they have now) or POP (chunky glossy 3D).
--
-- Expand only: one column defaulting to the look the code already draws,
-- so the version still live is unaffected and nothing needs a backfill.

ALTER TABLE `app_settings`
  ADD COLUMN `shortcut_art_style` VARCHAR(10) NOT NULL DEFAULT 'GLASS';
