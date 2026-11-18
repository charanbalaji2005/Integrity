-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "student_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "institutionName" TEXT,
    "rollNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_verifications_status_createdAt_idx" ON "student_verifications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "student_verifications_userId_idx" ON "student_verifications"("userId");

-- AddForeignKey
ALTER TABLE "student_verifications" ADD CONSTRAINT "student_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

