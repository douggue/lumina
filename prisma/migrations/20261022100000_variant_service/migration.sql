-- Social media service settings on each option (type, limits, average time, risk, refill, drip-feed)
ALTER TABLE "ProductVariant" ADD COLUMN "service" JSONB;
