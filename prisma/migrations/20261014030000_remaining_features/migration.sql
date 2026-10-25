-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'WAITING_CUSTOMER', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "customRoleId" TEXT,
ADD COLUMN     "notifyPrefs" JSONB NOT NULL DEFAULT '{"email":true,"whatsapp":true,"marketing":false}',
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "savedCart" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepUp" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepUp_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "PendingApproval" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PendingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "attachmentPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardAmount" INTEGER,
    "signupIp" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "excerpt" JSONB NOT NULL DEFAULT '{}',
    "body" JSONB NOT NULL DEFAULT '{}',
    "image" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectRule" (
    "id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSeo" (
    "path" TEXT NOT NULL,
    "title" JSONB NOT NULL DEFAULT '{}',
    "description" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSeo_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "TranslationOverride" (
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationOverride_pkey" PRIMARY KEY ("locale","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

-- CreateIndex
CREATE INDEX "PendingApproval_status_idx" ON "PendingApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredId_key" ON "Referral"("referredId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");

-- CreateIndex
CREATE INDEX "NewsArticle_isPublished_publishedAt_idx" ON "NewsArticle"("isPublished", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedirectRule_from_key" ON "RedirectRule"("from");

-- CreateIndex
CREATE UNIQUE INDEX "user_referralCode_key" ON "user"("referralCode");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

