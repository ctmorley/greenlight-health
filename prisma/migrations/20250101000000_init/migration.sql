-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('imaging_center', 'surgical_center', 'hospital', 'multi_specialty');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'pa_coordinator', 'physician', 'viewer');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('hmo', 'ppo', 'epo', 'pos', 'medicaid', 'medicare', 'tricare', 'other');

-- CreateEnum
CREATE TYPE "PayerType" AS ENUM ('commercial', 'medicare', 'medicaid', 'tricare');

-- CreateEnum
CREATE TYPE "RbmVendor" AS ENUM ('evicore', 'carelon', 'nia', 'direct');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('imaging', 'surgical', 'medical');

-- CreateEnum
CREATE TYPE "AuthStatus" AS ENUM ('draft', 'submitted', 'pending_review', 'approved', 'partially_approved', 'denied', 'appealed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('routine', 'urgent', 'emergent');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('mri', 'ct', 'pet_ct', 'ultrasound', 'xray', 'fluoroscopy', 'mammography', 'dexa', 'nuclear', 'surgical_procedure', 'medical_procedure');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('clinical_notes', 'imaging_order', 'lab_results', 'referral', 'medical_records', 'letter_of_necessity', 'other');

-- CreateEnum
CREATE TYPE "DenialReasonCategory" AS ENUM ('medical_necessity', 'incomplete_documentation', 'out_of_network', 'service_not_covered', 'missing_precert', 'coding_error', 'other');

-- CreateEnum
CREATE TYPE "AppealLevel" AS ENUM ('first', 'second', 'external_review');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('draft', 'filed', 'in_review', 'won', 'lost', 'withdrawn');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'imaging_center',
    "npi" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "title" TEXT,
    "npiNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'unknown',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_insurances" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planType" "PlanType" NOT NULL DEFAULT 'other',
    "memberId" TEXT NOT NULL,
    "groupNumber" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),

    CONSTRAINT "patient_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "type" "PayerType" NOT NULL DEFAULT 'commercial',
    "phone" TEXT,
    "fax" TEXT,
    "portalUrl" TEXT,
    "electronicSubmission" BOOLEAN NOT NULL DEFAULT false,
    "avgResponseDays" INTEGER NOT NULL DEFAULT 5,
    "rbmVendor" "RbmVendor",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payer_rules" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "serviceCategory" "ServiceCategory" NOT NULL,
    "cptCode" TEXT,
    "requiresPA" BOOLEAN NOT NULL DEFAULT true,
    "clinicalCriteria" JSONB,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prior_auth_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "referenceNumber" TEXT NOT NULL,
    "status" "AuthStatus" NOT NULL DEFAULT 'draft',
    "urgency" "Urgency" NOT NULL DEFAULT 'routine',
    "serviceCategory" "ServiceCategory" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "cptCodes" TEXT[],
    "icd10Codes" TEXT[],
    "procedureDescription" TEXT,
    "payerId" TEXT NOT NULL,
    "insuranceId" TEXT NOT NULL,
    "rbmVendor" "RbmVendor",
    "rbmReferenceNumber" TEXT,
    "orderingPhysicianId" TEXT,
    "renderingPhysicianNpi" TEXT,
    "facilityName" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "clinicalNotes" TEXT,
    "aiAuditResult" JSONB,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvedUnits" INTEGER,
    "approvedCptCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prior_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_documents" (
    "id" TEXT NOT NULL,
    "priorAuthId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'other',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_status_changes" (
    "id" TEXT NOT NULL,
    "priorAuthId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "fromStatus" "AuthStatus" NOT NULL,
    "toStatus" "AuthStatus" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denials" (
    "id" TEXT NOT NULL,
    "priorAuthId" TEXT NOT NULL,
    "denialDate" TIMESTAMP(3) NOT NULL,
    "reasonCode" TEXT,
    "reasonCategory" "DenialReasonCategory" NOT NULL,
    "reasonDescription" TEXT,
    "payerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "priorAuthId" TEXT NOT NULL,
    "denialId" TEXT NOT NULL,
    "appealLevel" "AppealLevel" NOT NULL,
    "filedDate" TIMESTAMP(3) NOT NULL,
    "filedById" TEXT NOT NULL,
    "appealReason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'draft',
    "decisionDate" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organizationId_mrn_key" ON "patients"("organizationId", "mrn");

-- CreateIndex
CREATE UNIQUE INDEX "payers_payerId_key" ON "payers"("payerId");

-- CreateIndex
CREATE UNIQUE INDEX "prior_auth_requests_referenceNumber_key" ON "prior_auth_requests"("referenceNumber");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_insurances" ADD CONSTRAINT "patient_insurances_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_insurances" ADD CONSTRAINT "patient_insurances_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payer_rules" ADD CONSTRAINT "payer_rules_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_orderingPhysicianId_fkey" FOREIGN KEY ("orderingPhysicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_auth_requests" ADD CONSTRAINT "prior_auth_requests_insuranceId_fkey" FOREIGN KEY ("insuranceId") REFERENCES "patient_insurances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_documents" ADD CONSTRAINT "auth_documents_priorAuthId_fkey" FOREIGN KEY ("priorAuthId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_documents" ADD CONSTRAINT "auth_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_status_changes" ADD CONSTRAINT "auth_status_changes_priorAuthId_fkey" FOREIGN KEY ("priorAuthId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_status_changes" ADD CONSTRAINT "auth_status_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denials" ADD CONSTRAINT "denials_priorAuthId_fkey" FOREIGN KEY ("priorAuthId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_priorAuthId_fkey" FOREIGN KEY ("priorAuthId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_denialId_fkey" FOREIGN KEY ("denialId") REFERENCES "denials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
