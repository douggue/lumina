-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_giftToken_key" ON "Order"("giftToken");

