-- Adds core_per_unit to InventoryReturn so a supplier part return can carry a
-- core cost alongside the part cost on the same row (return_type 'part_core'),
-- instead of only tracking part cost. Existing rows default to 0, which is a
-- correct historical value: no return row created before this migration ever
-- had a core cost merged into it.
ALTER TABLE "InventoryReturn"
  ADD COLUMN core_per_unit double precision DEFAULT 0;
