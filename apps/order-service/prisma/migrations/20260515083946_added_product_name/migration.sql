/*
  Warnings:

  - Added the required column `productName` to the `orderItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "orderItem" ADD COLUMN     "productName" TEXT NOT NULL;
