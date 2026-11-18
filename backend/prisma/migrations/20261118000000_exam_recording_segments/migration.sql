-- CreateTable
CREATE TABLE "exam_recording_segments" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_recording_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_recording_segments_attemptId_sequence_key" ON "exam_recording_segments"("attemptId", "sequence");

-- CreateIndex
CREATE INDEX "exam_recording_segments_attemptId_startedAt_idx" ON "exam_recording_segments"("attemptId", "startedAt");

-- AddForeignKey
ALTER TABLE "exam_recording_segments" ADD CONSTRAINT "exam_recording_segments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
