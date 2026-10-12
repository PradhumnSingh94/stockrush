-- Product Service reservation ledger.
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'RELEASED');

CREATE TABLE "stock_reservation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_reservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_reservation_orderId_key"
  ON "stock_reservation"("orderId");

CREATE TABLE "stock_reservation_item" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "stock_reservation_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_reservation_item_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "stock_reservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stock_reservation_item_reservationId_productId_key"
  ON "stock_reservation_item"("reservationId", "productId");
