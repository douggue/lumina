-- Trial anti-cheat: social account key, phone verify, network + risk score; PhoneVerification for WhatsApp inbound
ALTER TABLE "TrialRequest" ADD COLUMN IF NOT EXISTS "socialAccountKey" TEXT;
ALTER TABLE "TrialRequest" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "TrialRequest" ADD COLUMN IF NOT EXISTS "networkSignal" TEXT;
ALTER TABLE "TrialRequest" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TrialRequest" ADD COLUMN IF NOT EXISTS "riskBand" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TrialRequest_socialAccountKey_key" ON "TrialRequest"("socialAccountKey");
CREATE INDEX IF NOT EXISTS "TrialRequest_deviceId_idx" ON "TrialRequest"("deviceId");

CREATE TABLE IF NOT EXISTS "PhoneVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhoneVerification_phone_code_idx" ON "PhoneVerification"("phone", "code");
CREATE INDEX IF NOT EXISTS "PhoneVerification_userId_createdAt_idx" ON "PhoneVerification"("userId", "createdAt");
