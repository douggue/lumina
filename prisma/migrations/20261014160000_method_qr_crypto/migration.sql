ALTER TABLE "ManualMethod" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'mobile';
ALTER TABLE "ManualMethod" ADD COLUMN "network" TEXT;
ALTER TABLE "ManualMethod" ADD COLUMN "qrImage" TEXT;
ALTER TABLE "ManualMethod" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'HTG';
