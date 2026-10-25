-- CreateTable
CREATE TABLE "ServiceUpdate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" JSONB NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceUpdate_createdAt_idx" ON "ServiceUpdate"("createdAt");
