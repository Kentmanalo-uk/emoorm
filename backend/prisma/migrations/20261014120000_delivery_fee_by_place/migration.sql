-- A shop's own delivery can now also be priced by place, without a map pin:
-- FLAT (one fee everywhere, stores.delivery_fee), PER_TOWN (a fee for each
-- town it delivers to) and PER_BARANGAY (a fee for each barangay; a whole
-- town has one fee), both kept on store_service_areas.fee. FREE and PER_KM
-- are unchanged, and every existing shop keeps its mode: no data changes.

-- AlterTable
ALTER TABLE `stores` MODIFY `delivery_fee_mode` ENUM('FREE', 'FLAT', 'PER_TOWN', 'PER_BARANGAY', 'PER_KM') NOT NULL DEFAULT 'PER_KM';
