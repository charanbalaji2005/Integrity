-- CreateTable
CREATE TABLE "code_drafts" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "saveCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_executions" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT,
    "questionId" TEXT,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "stdin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "verdict" TEXT,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "exitCode" INTEGER,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "judgeTokens" TEXT,
    "sampleResults" TEXT,
    "infraError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "code_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_submissions" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'student',
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "suggestedMarks" DOUBLE PRECISION,
    "finalMarks" DOUBLE PRECISION,
    "finalizedBy" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_evaluations" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "runNumber" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggeredById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "compileStatus" TEXT,
    "compileOutput" TEXT,
    "testsPassed" INTEGER NOT NULL DEFAULT 0,
    "testsTotal" INTEGER NOT NULL DEFAULT 0,
    "testMarks" DOUBLE PRECISION,
    "aiMarks" DOUBLE PRECISION,
    "suggestedMarks" DOUBLE PRECISION,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "breakdown" TEXT,
    "feedback" TEXT,
    "confidence" DOUBLE PRECISION,
    "generatedBy" TEXT,
    "flagReasons" TEXT,
    "aiRaw" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "code_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_test_results" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "actualOutput" TEXT,
    "stderr" TEXT,
    "passed" BOOLEAN NOT NULL,
    "verdict" TEXT NOT NULL,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,

    CONSTRAINT "code_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_flags" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedFacultyId" TEXT,
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_reviews" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "flagId" TEXT,
    "facultyId" TEXT NOT NULL,
    "facultyName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "marks" DOUBLE PRECISION,
    "previousMarks" DOUBLE PRECISION,
    "remark" TEXT,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_evaluation_jobs" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggeredById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_evaluation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "code_drafts_studentId_idx" ON "code_drafts"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "code_drafts_attemptId_questionId_language_key" ON "code_drafts"("attemptId", "questionId", "language");

-- CreateIndex
CREATE INDEX "code_executions_userId_createdAt_idx" ON "code_executions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "code_executions_attemptId_questionId_createdAt_idx" ON "code_executions"("attemptId", "questionId", "createdAt");

-- CreateIndex
CREATE INDEX "code_executions_status_idx" ON "code_executions"("status");

-- CreateIndex
CREATE INDEX "code_submissions_assessmentId_status_idx" ON "code_submissions"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "code_submissions_studentId_idx" ON "code_submissions"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "code_submissions_attemptId_questionId_version_key" ON "code_submissions"("attemptId", "questionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "code_evaluations_submissionId_runNumber_key" ON "code_evaluations"("submissionId", "runNumber");

-- CreateIndex
CREATE INDEX "code_test_results_evaluationId_index_idx" ON "code_test_results"("evaluationId", "index");

-- CreateIndex
CREATE INDEX "code_flags_status_createdAt_idx" ON "code_flags"("status", "createdAt");

-- CreateIndex
CREATE INDEX "code_flags_submissionId_idx" ON "code_flags"("submissionId");

-- CreateIndex
CREATE INDEX "code_reviews_submissionId_createdAt_idx" ON "code_reviews"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "code_evaluation_jobs_status_nextRunAt_idx" ON "code_evaluation_jobs"("status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "code_drafts" ADD CONSTRAINT "code_drafts_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_drafts" ADD CONSTRAINT "code_drafts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_submissions" ADD CONSTRAINT "code_submissions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_submissions" ADD CONSTRAINT "code_submissions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_evaluations" ADD CONSTRAINT "code_evaluations_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "code_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_test_results" ADD CONSTRAINT "code_test_results_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "code_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_test_results" ADD CONSTRAINT "code_test_results_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "code_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_flags" ADD CONSTRAINT "code_flags_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "code_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "code_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_evaluation_jobs" ADD CONSTRAINT "code_evaluation_jobs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "code_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

