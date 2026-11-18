-- CreateTable
CREATE TABLE "proctoring_agent_config" (
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_agent_config_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "proctoring_config_audit" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_config_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proctoring_config_audit_createdAt_idx" ON "proctoring_config_audit"("createdAt");
