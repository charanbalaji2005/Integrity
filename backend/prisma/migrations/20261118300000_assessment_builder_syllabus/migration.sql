-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "assessmentType" TEXT NOT NULL DEFAULT 'quiz',
ADD COLUMN     "attemptResetAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSubmitOnExpiry" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "integrityConfig" TEXT,
ADD COLUMN     "materialsAccessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "materialsAvailableFrom" TIMESTAMP(3),
ADD COLUMN     "materialsAvailableUntil" TIMESTAMP(3),
ADD COLUMN     "materialsDownloadable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "materialsRestrictedDuringExam" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "negativeMarkValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "negativeMarking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passingMarks" DOUBLE PRECISION,
ADD COLUMN     "randomizeOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syllabusId" TEXT,
ADD COLUMN     "totalMarks" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "config" TEXT,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "topicId" TEXT;

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "department" TEXT,
    "institutionName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabi" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "statusMessage" TEXT,
    "fileId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_units" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_topics" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_materials" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "fileId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_materials" (
    "assessmentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "permittedInExam" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assessment_materials_pkey" PRIMARY KEY ("assessmentId","materialId")
);

-- CreateTable
CREATE TABLE "assessment_topics" (
    "assessmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "assessment_topics_pkey" PRIMARY KEY ("assessmentId","topicId")
);

-- CreateIndex
CREATE INDEX "stored_files_ownerId_sha256_idx" ON "stored_files"("ownerId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "courses_institutionName_code_key" ON "courses"("institutionName", "code");

-- CreateIndex
CREATE INDEX "syllabi_courseId_idx" ON "syllabi"("courseId");

-- CreateIndex
CREATE INDEX "course_units_syllabusId_order_idx" ON "course_units"("syllabusId", "order");

-- CreateIndex
CREATE INDEX "course_topics_unitId_order_idx" ON "course_topics"("unitId", "order");

-- CreateIndex
CREATE INDEX "course_materials_courseId_idx" ON "course_materials"("courseId");

-- CreateIndex
CREATE INDEX "assessments_courseId_idx" ON "assessments"("courseId");

-- CreateIndex
CREATE INDEX "questions_assessmentId_order_idx" ON "questions"("assessmentId", "order");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_syllabusId_fkey" FOREIGN KEY ("syllabusId") REFERENCES "syllabi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_units" ADD CONSTRAINT "course_units_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_units" ADD CONSTRAINT "course_units_syllabusId_fkey" FOREIGN KEY ("syllabusId") REFERENCES "syllabi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "course_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_materials" ADD CONSTRAINT "assessment_materials_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_materials" ADD CONSTRAINT "assessment_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "course_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: give existing questions a stable order matching their current physical (insertion) order.
UPDATE "questions" AS q
SET "order" = sub.rn
FROM (
    SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "assessmentId" ORDER BY ctid) - 1)::int AS rn
    FROM "questions"
) AS sub
WHERE q."id" = sub."id";
