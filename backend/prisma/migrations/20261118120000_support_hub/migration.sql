
-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "affectedModule" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "blocksExam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "examAttemptId" TEXT,
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "humanAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "institutionName" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownershipType" TEXT NOT NULL DEFAULT 'AI',
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT,
ADD COLUMN     "reassignmentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "subcategory" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Support request',
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "waitingSince" TIMESTAMP(3),
ALTER COLUMN "priority" SET DEFAULT 'P3',
ALTER COLUMN "status" SET DEFAULT 'unassigned';

-- AlterTable
ALTER TABLE "ticket_messages" ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "support_staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supportRole" TEXT NOT NULL DEFAULT 'agent',
    "availability" TEXT NOT NULL DEFAULT 'available',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "assignmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxActiveTickets" INTEGER NOT NULL DEFAULT 8,
    "expertise" TEXT NOT NULL DEFAULT '[]',
    "workingHours" TEXT,
    "lastAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignmentScore" DOUBLE PRECISION,
    "scoreBreakdown" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "timeoutAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reassignmentReason" TEXT,
    "assignedById" TEXT,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ai_analyses" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "priority" TEXT NOT NULL,
    "priorityReason" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "issueSummary" TEXT NOT NULL,
    "suggestedDepartment" TEXT NOT NULL,
    "requiredExpertise" TEXT NOT NULL DEFAULT '[]',
    "recommendedStaffId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "blocksExam" BOOLEAN NOT NULL DEFAULT false,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "generatedBy" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_portal_contexts" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL DEFAULT 'Student Portal',
    "sourcePath" TEXT,
    "sourceModule" TEXT,
    "examinationSessionId" TEXT,
    "browserInformation" TEXT,
    "deviceInformation" TEXT,
    "connectionInformation" TEXT,
    "diagnosticMetadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_portal_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_internal_notes" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "ticketId" TEXT,
    "action" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "weights" TEXT NOT NULL,
    "acceptanceTimeoutSeconds" INTEGER NOT NULL DEFAULT 180,
    "allowOfflineAssignment" BOOLEAN NOT NULL DEFAULT false,
    "reassignAlertThreshold" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_counters" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "support_counters_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_staff_userId_key" ON "support_staff"("userId");

-- CreateIndex
CREATE INDEX "ticket_assignments_ticketId_assignedAt_idx" ON "ticket_assignments"("ticketId", "assignedAt");

-- CreateIndex
CREATE INDEX "ticket_assignments_staffId_status_idx" ON "ticket_assignments"("staffId", "status");

-- CreateIndex
CREATE INDEX "ticket_assignments_status_timeoutAt_idx" ON "ticket_assignments"("status", "timeoutAt");

-- CreateIndex
CREATE INDEX "support_ai_analyses_ticketId_createdAt_idx" ON "support_ai_analyses"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_portal_contexts_ticketId_key" ON "student_portal_contexts"("ticketId");

-- CreateIndex
CREATE INDEX "support_internal_notes_ticketId_createdAt_idx" ON "support_internal_notes"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "support_audit_logs_ticketId_createdAt_idx" ON "support_audit_logs"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "support_audit_logs_actorId_createdAt_idx" ON "support_audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "support_attachments_ticketId_idx" ON "support_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "knowledge_articles_category_idx" ON "knowledge_articles"("category");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_studentId_createdAt_idx" ON "support_tickets"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_assignedAgentId_status_idx" ON "support_tickets"("assignedAgentId", "status");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_staff" ADD CONSTRAINT "support_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "support_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ai_analyses" ADD CONSTRAINT "support_ai_analyses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_portal_contexts" ADD CONSTRAINT "student_portal_contexts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_internal_notes" ADD CONSTRAINT "support_internal_notes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_audit_logs" ADD CONSTRAINT "support_audit_logs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ticket_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data migration: map legacy ticket values to the Support Hub scheme
UPDATE "support_tickets" SET "priority" = CASE "priority"
  WHEN 'high' THEN 'P2' WHEN 'medium' THEN 'P3' WHEN 'low' THEN 'P4' ELSE "priority" END
  WHERE "priority" IN ('high', 'medium', 'low');
UPDATE "support_tickets" SET "status" = CASE "status"
  WHEN 'pending' THEN 'unassigned' WHEN 'waiting' THEN 'unassigned' WHEN 'active' THEN 'in_progress' ELSE "status" END
  WHERE "status" IN ('pending', 'waiting', 'active');
UPDATE "support_tickets" SET "ownershipType" = 'HUMAN' WHERE "status" = 'in_progress' AND "assignedAgentId" IS NOT NULL;
UPDATE "support_tickets" SET "category" = CASE "category"
  WHEN 'technical' THEN 'technical' WHEN 'assessment' THEN 'assessment_quiz' WHEN 'account-recovery' THEN 'login_auth'
  WHEN 'integrity-clarifications' THEN 'ai_proctoring' WHEN 'live-chat' THEN 'other' ELSE "category" END;
UPDATE "support_tickets" SET "title" = LEFT(REGEXP_REPLACE("description", '\s+', ' ', 'g'), 80) WHERE "title" = 'Support request';
UPDATE "support_tickets" SET "lastMessageAt" = COALESCE((SELECT MAX(m."createdAt") FROM "ticket_messages" m WHERE m."ticketId" = "support_tickets"."id"), "createdAt");
UPDATE "support_tickets" SET "resolvedAt" = "updatedAt" WHERE "status" = 'resolved' AND "resolvedAt" IS NULL;
UPDATE "ticket_messages" SET "messageType" = 'system' WHERE "senderId" = 'system';
