-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "suspendedUntil" TIMESTAMP(3),
    "institutionName" TEXT,
    "department" TEXT,
    "academicId" TEXT,
    "phoneNumber" TEXT,
    "designation" TEXT,
    "bio" TEXT,
    "joiningDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rollNumber" TEXT,
    "semester" TEXT,
    "branch" TEXT,
    "section" TEXT,
    "subjects" TEXT,
    "accessLevel" TEXT,
    "managedDepartments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "changePasswordAtNextLogin" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_histories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "availabilityStart" TIMESTAMP(3),
    "availabilityEnd" TIMESTAMP(3),
    "attemptLimit" INTEGER NOT NULL DEFAULT 1,
    "gradingScheme" TEXT NOT NULL DEFAULT 'points',
    "institutionName" TEXT NOT NULL,
    "facultyName" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "webcamMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "microphoneAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "browserLockdown" BOOLEAN NOT NULL DEFAULT false,
    "faceVerification" BOOLEAN NOT NULL DEFAULT false,
    "gazeTracking" BOOLEAN NOT NULL DEFAULT false,
    "tabSwitchDetection" BOOLEAN NOT NULL DEFAULT false,
    "behavioralAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "allowResume" BOOLEAN NOT NULL DEFAULT true,
    "maxResumeCount" INTEGER NOT NULL DEFAULT 3,
    "resumeTimeWindow" INTEGER NOT NULL DEFAULT 15,
    "resumeAfterDisconnect" BOOLEAN NOT NULL DEFAULT true,
    "resumeAfterCrash" BOOLEAN NOT NULL DEFAULT true,
    "resumeAfterLogout" BOOLEAN NOT NULL DEFAULT false,
    "retakeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "retakeDate" TIMESTAMP(3),
    "attemptLock" BOOLEAN NOT NULL DEFAULT false,
    "lateSubmissionAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT,
    "correctAnswer" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "learningOutcome" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "integrityScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plagiarismScore" DOUBLE PRECISION,
    "aiDetectionScore" DOUBLE PRECISION,
    "similarityScore" DOUBLE PRECISION,
    "writingScore" DOUBLE PRECISION,
    "grammarScore" DOUBLE PRECISION,
    "citationScore" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "evaluationSummary" TEXT,
    "recommendations" TEXT,
    "evaluationEvidence" TEXT,
    "modelUsed" TEXT,
    "evaluationTime" INTEGER,
    "certificateNumber" TEXT,
    "verificationCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resumeCount" INTEGER NOT NULL DEFAULT 0,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "timeLeft" INTEGER,
    "markedQuestions" TEXT NOT NULL DEFAULT '[]',
    "visitedQuestions" TEXT NOT NULL DEFAULT '[]',
    "networkQuality" TEXT NOT NULL DEFAULT 'Excellent',
    "networkLatency" INTEGER NOT NULL DEFAULT 0,
    "faceStatus" TEXT NOT NULL DEFAULT 'Detected',
    "backgroundNoise" TEXT NOT NULL DEFAULT 'Quiet',
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "proctoringStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "proctoringSummary" TEXT,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "aiGrade" DOUBLE PRECISION,
    "aiConfidence" DOUBLE PRECISION,
    "manualGrade" DOUBLE PRECISION,
    "feedback" TEXT,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "aiEvaluation" TEXT,
    "overrideStatus" TEXT NOT NULL DEFAULT 'none',
    "originalResponse" TEXT,
    "embedding" TEXT,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_audit_trails" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answerId" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "facultyModifications" TEXT,
    "originalAnswer" TEXT NOT NULL,
    "finalAnswerScore" DOUBLE PRECISION NOT NULL,
    "similarityResults" TEXT NOT NULL,
    "riskAnalysisResults" TEXT NOT NULL,
    "overrideStatus" TEXT NOT NULL,
    "facultyId" TEXT,
    "facultyName" TEXT,

    CONSTRAINT "evaluation_audit_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_alerts" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "evidence" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "network" TEXT,
    "latency" INTEGER,
    "device" TEXT,

    CONSTRAINT "violation_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "department" TEXT NOT NULL DEFAULT 'Technical Support',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT NOT NULL,
    "queuePosition" INTEGER NOT NULL DEFAULT 1,
    "estimatedWait" INTEGER NOT NULL DEFAULT 5,
    "assignedAgentId" TEXT,
    "assignedAgentName" TEXT,
    "resolutionDetails" TEXT,
    "embedding" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "senderName" TEXT,
    "senderRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "department" TEXT,
    "semester" TEXT,
    "section" TEXT,
    "recipientId" TEXT,
    "attachments" TEXT,
    "parentId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "reactions" TEXT,
    "readBy" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "forwardedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_requests" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "agentName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_jobs" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctoring_timeline_events" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,

    CONSTRAINT "proctoring_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_certificateNumber_key" ON "assessment_attempts"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_verificationCode_key" ON "assessment_attempts"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_referenceNumber_key" ON "support_tickets"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_jobs_attemptId_key" ON "evaluation_jobs"("attemptId");

-- AddForeignKey
ALTER TABLE "password_histories" ADD CONSTRAINT "password_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_alerts" ADD CONSTRAINT "violation_alerts_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_requests" ADD CONSTRAINT "chat_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_requests" ADD CONSTRAINT "chat_requests_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctoring_timeline_events" ADD CONSTRAINT "proctoring_timeline_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
