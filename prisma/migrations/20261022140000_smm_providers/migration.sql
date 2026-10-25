-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "backupSupplierId" TEXT,
ADD COLUMN     "backupSupplierSku" TEXT;

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "cancelAt" TIMESTAMP(3),
ADD COLUMN     "refillAt" TIMESTAMP(3),
ADD COLUMN     "refillId" TEXT,
ADD COLUMN     "refillStatus" TEXT,
ADD COLUMN     "refundedPartial" INTEGER,
ADD COLUMN     "remains" INTEGER,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "startCount" INTEGER;

-- CreateTable
CREATE TABLE "ProviderService" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "refill" BOOLEAN NOT NULL DEFAULT false,
    "cancel" BOOLEAN NOT NULL DEFAULT false,
    "dripfeed" BOOLEAN NOT NULL DEFAULT false,
    "desc" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderService_supplierId_category_idx" ON "ProviderService"("supplierId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderService_supplierId_serviceId_key" ON "ProviderService"("supplierId", "serviceId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_backupSupplierId_fkey" FOREIGN KEY ("backupSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

