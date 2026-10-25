ALTER TABLE "user" ADD COLUMN "city" TEXT;
ALTER TABLE "user" ADD COLUMN "showInFeed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "salesPopup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductVariant" ADD COLUMN "lowStock" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "ProductVariant" ADD COLUMN "lowStockUntil" TIMESTAMP(3);

CREATE TABLE "SaleFeedItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleFeedItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleFeedItem_soldAt_idx" ON "SaleFeedItem"("soldAt");
ALTER TABLE "SaleFeedItem" ADD CONSTRAINT "SaleFeedItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "productId" TEXT,
    "rating" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ht',
    "source" TEXT NOT NULL DEFAULT 'order',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "onHome" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");
CREATE INDEX "Review_status_onHome_idx" ON "Review"("status", "onHome");
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
