-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VideoTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "platform" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "rhTaskId" TEXT,
    "publishResult" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "rhApiVersion" TEXT,
    "rhOutputs" JSONB,
    "modelEndpoint" TEXT,
    "modelParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoTask_scheduledAt_idx" ON "VideoTask"("scheduledAt");

-- CreateIndex
CREATE INDEX "VideoTask_status_idx" ON "VideoTask"("status");

-- CreateIndex
CREATE INDEX "VideoTask_userId_idx" ON "VideoTask"("userId");
