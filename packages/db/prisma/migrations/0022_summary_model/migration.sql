-- Cheap model used for long-run status lines and history compaction.
ALTER TABLE "deployment_settings" ADD COLUMN "summaryModelProvider" TEXT;
ALTER TABLE "deployment_settings" ADD COLUMN "summaryModelId" TEXT;
