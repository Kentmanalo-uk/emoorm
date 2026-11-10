-- The ML engine's own storage (docs/ml/README.md). Everything it needs to
-- remember, beside the shop's tables, never in place of them:
--
--   ml_event_counts    per product, per Manila day, per kind of event: how
--                      many times it was put in a cart, taken out, saved,
--                      unsaved. Totals only: no buyer is recorded (views
--                      stay in product_views, searches on the device).
--   ml_predictions     results worked out ahead of time (similar products,
--                      bundles, forecasts, stock risk...), one row per
--                      model, kind and thing, with when it goes stale.
--   ml_model_versions  each model's parameters (small JSON) and scores;
--                      exactly one ACTIVE per model, older ones kept for a
--                      roll back.
--   ml_training_runs   every run of a module's job: when, how long, how
--                      many rows, its scores, or why it failed.
--   ml_alerts          things for a person to look at (an unusual order, a
--                      product about to run out), with a review status.
--                      Nothing acts on its own.
--   app_settings.ml_settings  the super admin's switches (JSON; null or a
--                      missing key = off).
--
-- Expand only: new tables nothing reads yet and one nullable column, so the
-- version still live ignores all of it.
--
-- To undo (in this order, after the code that uses them is gone):
--   ALTER TABLE `app_settings` DROP COLUMN `ml_settings`;
--   DROP TABLE `ml_alerts`; DROP TABLE `ml_training_runs`;
--   DROP TABLE `ml_model_versions`; DROP TABLE `ml_predictions`;
--   DROP TABLE `ml_event_counts`;

CREATE TABLE `ml_event_counts` (
  `day` DATE NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`day`, `event_type`, `product_id`),
  INDEX `ml_event_counts_product_idx`(`product_id`, `event_type`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ml_predictions` (
  `id` VARCHAR(191) NOT NULL,
  `model_key` VARCHAR(40) NOT NULL,
  `model_version` INT NOT NULL,
  `prediction_type` VARCHAR(40) NOT NULL,
  `entity_type` VARCHAR(20) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `meta` JSON NULL,
  `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ml_predictions_entity_key`(`model_key`, `prediction_type`, `entity_type`, `entity_id`),
  INDEX `ml_predictions_expires_idx`(`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ml_model_versions` (
  `id` VARCHAR(191) NOT NULL,
  `model_key` VARCHAR(40) NOT NULL,
  `version` INT NOT NULL,
  `algorithm` VARCHAR(80) NOT NULL,
  `params` JSON NULL,
  `metrics` JSON NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'CANDIDATE',
  `trained_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activated_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ml_model_versions_key_version_key`(`model_key`, `version`),
  INDEX `ml_model_versions_status_idx`(`model_key`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ml_training_runs` (
  `id` VARCHAR(191) NOT NULL,
  `model_key` VARCHAR(40) NOT NULL,
  `model_version` INT NULL,
  `trigger` VARCHAR(12) NOT NULL DEFAULT 'SCHEDULE',
  `status` VARCHAR(12) NOT NULL DEFAULT 'RUNNING',
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `duration_ms` INT NULL,
  `rows_read` INT NULL,
  `rows_written` INT NULL,
  `metrics` JSON NULL,
  `error_summary` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `ml_training_runs_key_idx`(`model_key`, `started_at`),
  INDEX `ml_training_runs_started_idx`(`started_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ml_alerts` (
  `id` VARCHAR(191) NOT NULL,
  `alert_type` VARCHAR(40) NOT NULL,
  `entity_type` VARCHAR(20) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NULL,
  `municipality_id` VARCHAR(191) NULL,
  `dedupe_key` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  `score` DOUBLE NULL,
  `description` VARCHAR(500) NOT NULL,
  `details` JSON NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW',
  `reviewed_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ml_alerts_dedupe_key`(`alert_type`, `dedupe_key`),
  INDEX `ml_alerts_status_idx`(`status`, `created_at`),
  INDEX `ml_alerts_store_idx`(`store_id`, `status`),
  INDEX `ml_alerts_municipality_idx`(`municipality_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `app_settings`
  ADD COLUMN `ml_settings` JSON NULL;
