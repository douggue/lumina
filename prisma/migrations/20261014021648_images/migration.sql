-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gallery" JSONB NOT NULL DEFAULT '[]';
