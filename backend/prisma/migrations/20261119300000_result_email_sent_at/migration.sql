-- AlterTable
ALTER TABLE "assessment_attempts" ADD COLUMN     "resultEmailSentAt" TIMESTAMP(3);


-- Attempts already emailed by the earlier version (recorded as a timeline event) must not be emailed again.
UPDATE "assessment_attempts" AS a
SET "resultEmailSentAt" = e."timestamp"
FROM (
    SELECT "attemptId", MIN("timestamp") AS "timestamp"
    FROM "proctoring_timeline_events"
    WHERE "event" = 'Results Emailed'
    GROUP BY "attemptId"
) AS e
WHERE a."id" = e."attemptId" AND a."resultEmailSentAt" IS NULL;
