-- Add encrypted + blind index columns to patients (all nullable for dual-write period)
ALTER TABLE "patients" ADD COLUMN "mrnEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "firstNameEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "lastNameEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "dobEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "phoneEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "emailEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "addressEncrypted" TEXT;
ALTER TABLE "patients" ADD COLUMN "mrnHash" TEXT;
ALTER TABLE "patients" ADD COLUMN "firstNameHash" TEXT;
ALTER TABLE "patients" ADD COLUMN "lastNameHash" TEXT;
ALTER TABLE "patients" ADD COLUMN "dobHash" TEXT;
ALTER TABLE "patients" ADD COLUMN "emailHash" TEXT;

-- Indexes on blind index columns for search/uniqueness
CREATE INDEX "patients_organizationId_mrnHash_idx" ON "patients"("organizationId", "mrnHash");
CREATE INDEX "patients_organizationId_lastNameHash_idx" ON "patients"("organizationId", "lastNameHash");
CREATE INDEX "patients_organizationId_emailHash_idx" ON "patients"("organizationId", "emailHash");
CREATE INDEX "patients_organizationId_lastNameHash_firstNameHash_idx" ON "patients"("organizationId", "lastNameHash", "firstNameHash");

-- Add encrypted + blind index columns to patient_insurances
ALTER TABLE "patient_insurances" ADD COLUMN "memberIdEncrypted" TEXT;
ALTER TABLE "patient_insurances" ADD COLUMN "groupNumberEncrypted" TEXT;
ALTER TABLE "patient_insurances" ADD COLUMN "memberIdHash" TEXT;

-- Index on member ID blind index
CREATE INDEX "patient_insurances_memberIdHash_idx" ON "patient_insurances"("memberIdHash");
