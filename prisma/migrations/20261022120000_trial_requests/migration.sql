-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TrialRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "status" "TrialStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TrialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialRequest_userId_key" ON "TrialRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialRequest_link_key" ON "TrialRequest"("link");

-- CreateIndex
CREATE UNIQUE INDEX "TrialRequest_phone_key" ON "TrialRequest"("phone");

-- CreateIndex
CREATE INDEX "TrialRequest_status_createdAt_idx" ON "TrialRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrialRequest_ip_createdAt_idx" ON "TrialRequest"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "TrialRequest" ADD CONSTRAINT "TrialRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

