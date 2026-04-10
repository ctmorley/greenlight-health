-- Move MRN uniqueness enforcement to mrnHash blind index column.
-- The old @@unique([organizationId, mrn]) stays until plaintext columns are dropped.
-- PostgreSQL treats NULLs as distinct in unique constraints, so pre-backfill
-- rows with NULL mrnHash won't conflict.

-- Drop the non-unique index (replaced by the unique constraint below)
DROP INDEX IF EXISTS "patients_organizationId_mrnHash_idx";

-- Add unique constraint on (organizationId, mrnHash)
CREATE UNIQUE INDEX "patients_organizationId_mrnHash_key" ON "patients"("organizationId", "mrnHash");
