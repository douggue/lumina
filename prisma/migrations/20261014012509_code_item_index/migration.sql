-- DropIndex
DROP INDEX "CodeItem_orderItemId_key";

-- CreateIndex
CREATE INDEX "CodeItem_orderItemId_idx" ON "CodeItem"("orderItemId");
