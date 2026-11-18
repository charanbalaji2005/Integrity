-- CreateTable
CREATE TABLE "exam_feedback" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "assessmentTitle" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentEmail" TEXT,
    "overallRating" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "proctoringRating" INTEGER NOT NULL,
    "technicalIssues" TEXT NOT NULL DEFAULT '[]',
    "comments" TEXT,
    "sentiment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_feedback_attemptId_key" ON "exam_feedback"("attemptId");

-- CreateIndex
CREATE INDEX "exam_feedback_assessmentId_idx" ON "exam_feedback"("assessmentId");

-- CreateIndex
CREATE INDEX "exam_feedback_createdAt_idx" ON "exam_feedback"("createdAt");

-- AddForeignKey
ALTER TABLE "exam_feedback" ADD CONSTRAINT "exam_feedback_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
