-- Durable AI proctoring session state
ALTER TABLE "assessment_attempts" ADD COLUMN "proctoringState" TEXT;
ALTER TABLE "assessment_attempts" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "assessment_attempts" ADD COLUMN "lastFrameAt" TIMESTAMP(3);
