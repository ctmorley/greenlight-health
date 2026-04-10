-- Gate A: PHI Plaintext Cutover — Make plaintext columns nullable
--
-- After the backfill is validated, these columns will stop receiving writes.
-- They remain in the schema (nullable) during the soak period and will be
-- dropped in a follow-up migration (Gate A6) after the soak period passes.

-- Make plaintext PHI columns nullable on patients table
ALTER TABLE "patients" ALTER COLUMN "mrn" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "firstName" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "lastName" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "dob" DROP NOT NULL;

-- Drop the plaintext MRN unique constraint (replaced by hash-based constraint)
DROP INDEX IF EXISTS "patients_organizationId_mrn_key";

-- Make plaintext memberId nullable on patient_insurances table
ALTER TABLE "patient_insurances" ALTER COLUMN "memberId" DROP NOT NULL;
