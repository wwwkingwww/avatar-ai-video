-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'AWAITING_REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'PUBLISH_FAILED';

-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "nameCn" TEXT NOT NULL DEFAULT '',
    "nameEn" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "taskType" TEXT NOT NULL DEFAULT '',
    "outputType" TEXT NOT NULL DEFAULT '',
    "inputTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "params" JSONB NOT NULL DEFAULT '[]',
    "className" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredTier" TEXT NOT NULL DEFAULT 'standard',
    "preferSpeed" BOOLEAN NOT NULL DEFAULT false,
    "preferQuality" BOOLEAN NOT NULL DEFAULT false,
    "frequentlyUsedEndpoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetLevel" TEXT NOT NULL DEFAULT 'balanced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelRegistry_endpoint_key" ON "ModelRegistry"("endpoint");

-- CreateIndex
CREATE INDEX "ModelRegistry_status_idx" ON "ModelRegistry"("status");

-- CreateIndex
CREATE INDEX "ModelRegistry_category_idx" ON "ModelRegistry"("category");

-- CreateIndex
CREATE INDEX "ModelRegistry_visible_idx" ON "ModelRegistry"("visible");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "UserPreference_userId_idx" ON "UserPreference"("userId");
