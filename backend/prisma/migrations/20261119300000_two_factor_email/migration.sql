-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "twoFactorPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "two_factor_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL DEFAULT '',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_codes_userId_purpose_sessionKey_key" ON "two_factor_codes"("userId", "purpose", "sessionKey");

