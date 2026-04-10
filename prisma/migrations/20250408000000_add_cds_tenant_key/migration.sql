-- Add opaque tenant key for CDS Hooks endpoint routing
ALTER TABLE "organizations" ADD COLUMN "cdsTenantKey" TEXT;
CREATE UNIQUE INDEX "organizations_cdsTenantKey_key" ON "organizations"("cdsTenantKey");
