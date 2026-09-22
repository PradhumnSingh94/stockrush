import { prisma } from "../db/prisma.client";
import { AppError, ErrorCode, CreateOrderDto } from "@stockrush/shared";
import { productClient } from "../clients/product.grpc.client";
import { OrderStream } from "../streams/order.stream";

export const OrderService = {
  async create(dto: CreateOrderDto, correlationId: string) {
    const { items } = dto;

    const successfulDecrements: string[] = [];
    const itemSnapshots = [];
    try {
      for (const item of items) {
        const product = await productClient.get(item.productId);
        if (product.stock < item.quantity) {
          throw new Error(`Inssuficient stock for ${product.name}`);
        }
        await productClient.decrement(item.productId, item.quantity);
        successfulDecrements.push(item.productId);
        itemSnapshots.push({
          productId: item.productId,
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
        });
      }
      const order = await prisma.order.create({
        data: {
          status: "CONFIRMED",
          userId: dto.userId,
          items: {
            create: itemSnapshots.map((snap) => ({
              productId: snap.productId,
              productName: snap.productName,
              unitPrice: snap.unitPrice, // Snapshot price
              quantity: snap.quantity,
            })),
          },
        },
        include: { items: true },
      });
      await OrderStream.publishConfirmed(
        {
          orderId: order.id,
          userId: dto.userId,
          userEmail: dto.userEmail,
          items: itemSnapshots.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
        },
        correlationId,
      );

      return order;
    } catch (error: any) {
      console.error(
        "Order process failed, starting compensation...",
        error.message,
      );

      // 5. Compensation Logic (The Undo Loop)
      for (const productId of successfulDecrements) {
        const failedItem = items.find(
          (i: { productId: string }) => i.productId === productId,
        );
        if (failedItem) {
          await productClient.increment(productId, failedItem.quantity);
          console.log(
            `Compensated stock for product ${productId} by incrementing ${failedItem.quantity}`,
          );
        }
      }

      return "Order processing failed";
    }
  },
};
