-- CreateTable
CREATE TABLE "plagiarism_documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "institutionName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plagiarism_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plagiarism_fingerprints" (
    "hash" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "plagiarism_fingerprints_pkey" PRIMARY KEY ("hash","documentId")
);

-- CreateTable
CREATE TABLE "plagiarism_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT,
    "similarity" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plagiarism_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plagiarism_documents_contentHash_idx" ON "plagiarism_documents"("contentHash");

-- CreateIndex
CREATE INDEX "plagiarism_documents_ownerId_idx" ON "plagiarism_documents"("ownerId");

-- CreateIndex
CREATE INDEX "plagiarism_fingerprints_hash_idx" ON "plagiarism_fingerprints"("hash");

-- CreateIndex
CREATE INDEX "plagiarism_reports_userId_createdAt_idx" ON "plagiarism_reports"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "plagiarism_documents" ADD CONSTRAINT "plagiarism_documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plagiarism_fingerprints" ADD CONSTRAINT "plagiarism_fingerprints_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "plagiarism_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plagiarism_reports" ADD CONSTRAINT "plagiarism_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

