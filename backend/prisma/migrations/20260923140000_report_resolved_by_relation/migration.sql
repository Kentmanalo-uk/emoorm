-- `resolved_by_id` was written but never joinable, so the admin drawer could
-- only render the raw UUID of whoever decided a report. Make it a real FK.
--
-- Any id that no longer points at a live user is cleared first, otherwise the
-- constraint cannot be added. ON DELETE SET NULL keeps the report when the
-- admin account is removed: who decided it is less important than the decision.
UPDATE `reports` r
  LEFT JOIN `users` u ON u.`id` = r.`resolved_by_id`
  SET r.`resolved_by_id` = NULL
  WHERE r.`resolved_by_id` IS NOT NULL AND u.`id` IS NULL;

CREATE INDEX `reports_resolved_by_idx` ON `reports`(`resolved_by_id`);

ALTER TABLE `reports`
  ADD CONSTRAINT `reports_resolved_by_id_fkey`
  FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
