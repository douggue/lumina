-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('QUEUED', 'SENDING', 'PENDING', 'UNKNOWN', 'SUCCESS', 'FAILED', 'CLOSED');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "supplierSku" TEXT;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secrets" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "callbackToken" TEXT NOT NULL,
    "tokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "balance" DECIMAL(18,4),
    "balanceCurrency" TEXT,
    "balanceAt" TIMESTAMP(3),
    "lowBalance" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "supplierOrderId" TEXT,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'QUEUED',
    "message" TEXT,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "nextCheckAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierLog" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierOrderId" TEXT,
    "op" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "ms" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_callbackToken_key" ON "Supplier"("callbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_ref_key" ON "SupplierOrder"("ref");

-- CreateIndex
CREATE INDEX "SupplierOrder_status_nextCheckAt_idx" ON "SupplierOrder"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "SupplierOrder_orderItemId_idx" ON "SupplierOrder"("orderItemId");

-- CreateIndex
CREATE INDEX "SupplierLog_supplierId_createdAt_idx" ON "SupplierLog"("supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLog" ADD CONSTRAINT "SupplierLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLog" ADD CONSTRAINT "SupplierLog_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

