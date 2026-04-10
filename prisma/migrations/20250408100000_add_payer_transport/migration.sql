-- Transport enums
CREATE TYPE "TransportMethod" AS ENUM ('fhir_pas', 'edi_278', 'rpa_portal', 'fax_manual', 'simulated');
CREATE TYPE "TransportEnvironment" AS ENUM ('sandbox', 'production');

-- Payer transport configuration
CREATE TABLE "payer_transports" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "method" "TransportMethod" NOT NULL,
    "environment" "TransportEnvironment" NOT NULL DEFAULT 'sandbox',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "endpointUrl" TEXT,
    "statusEndpointUrl" TEXT,
    "externalPayerId" TEXT,
    "clearinghousePayerId" TEXT,
    "credentialRef" TEXT,
    "supportsAttachments" BOOLEAN NOT NULL DEFAULT false,
    "supportsStatusCheck" BOOLEAN NOT NULL DEFAULT false,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_transports_pkey" PRIMARY KEY ("id")
);

-- Submission attempt tracking
CREATE TABLE "submission_attempts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "transportMethod" "TransportMethod" NOT NULL,
    "environment" "TransportEnvironment" NOT NULL,
    "externalSubmissionId" TEXT,
    "status" TEXT NOT NULL,
    "httpStatusCode" INTEGER,
    "responseCode" TEXT,
    "responseSummary" TEXT,
    "failureCategory" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseTimeMs" INTEGER,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "retryOf" TEXT,
    "bundleRef" TEXT,
    "responseRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attempts_pkey" PRIMARY KEY ("id")
);

-- Indexes
-- Use COALESCE so NULL organizationId is treated as a known value for uniqueness.
-- Without this, Postgres allows duplicate (payerId, NULL, method, environment) rows.
CREATE UNIQUE INDEX "payer_transports_payerId_organizationId_method_environment_key"
  ON "payer_transports"("payerId", COALESCE("organizationId", '__global__'), "method", "environment");
CREATE INDEX "payer_transports_payerId_isEnabled_idx" ON "payer_transports"("payerId", "isEnabled");
CREATE INDEX "submission_attempts_requestId_idx" ON "submission_attempts"("requestId");
CREATE INDEX "submission_attempts_transportId_idx" ON "submission_attempts"("transportId");
CREATE INDEX "submission_attempts_externalSubmissionId_idx" ON "submission_attempts"("externalSubmissionId");

-- Foreign keys
ALTER TABLE "payer_transports" ADD CONSTRAINT "payer_transports_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_transports" ADD CONSTRAINT "payer_transports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "payer_transports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: create default simulated transports for every existing payer.
-- Creates both sandbox and production rows so the submit route works
-- regardless of the TRANSPORT_ENVIRONMENT setting.
INSERT INTO "payer_transports" ("id", "payerId", "organizationId", "method", "environment", "isEnabled", "priority", "requiresHumanReview", "updatedAt")
SELECT
  'pt-backfill-sb-' || "id",
  "id",
  NULL,
  'simulated',
  'sandbox',
  true,
  99,
  false,
  NOW()
FROM "payers";

INSERT INTO "payer_transports" ("id", "payerId", "organizationId", "method", "environment", "isEnabled", "priority", "requiresHumanReview", "updatedAt")
SELECT
  'pt-backfill-pr-' || "id",
  "id",
  NULL,
  'simulated',
  'production',
  true,
  99,
  false,
  NOW()
FROM "payers";
