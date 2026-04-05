-- AlterTable
ALTER TABLE "urls" ADD COLUMN     "click_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "click_limit" INTEGER,
ADD COLUMN     "expires_at" TIMESTAMP(3);
