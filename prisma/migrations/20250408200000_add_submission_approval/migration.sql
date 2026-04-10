-- Approval status enum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- Submission approval table
CREATE TABLE "submission_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_approvals_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "submission_approvals_requestId_transportId_key" ON "submission_approvals"("requestId", "transportId");
CREATE INDEX "submission_approvals_requestId_idx" ON "submission_approvals"("requestId");

-- Foreign keys
ALTER TABLE "submission_approvals" ADD CONSTRAINT "submission_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "prior_auth_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_approvals" ADD CONSTRAINT "submission_approvals_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "payer_transports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_approvals" ADD CONSTRAINT "submission_approvals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: fix Phase 1 transport ownership.
-- Org-owned payers currently have global (NULL) simulated transports.
-- Set organizationId to match the parent payer's organizationId.
UPDATE "payer_transports" pt
SET "organizationId" = p."organizationId"
FROM "payers" p
WHERE pt."payerId" = p."id"
  AND p."organizationId" IS NOT NULL
  AND pt."organizationId" IS NULL
  AND pt."method" = 'simulated';
