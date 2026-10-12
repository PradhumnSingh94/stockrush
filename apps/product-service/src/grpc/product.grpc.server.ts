import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { prisma } from "../db/prisma.client";
import {
  reserveStock,
  getReservation,
  releaseStock,
} from "../services/stock-reservation.service";

const sharedPackageJson = require.resolve("@stockrush/shared/package.json");
const sharedRoot = path.dirname(sharedPackageJson);
const PROTO_PATH = path.join(sharedRoot, "src/proto/product.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const productProto = grpc.loadPackageDefinition(packageDefinition) as any;
const server = new grpc.Server();

function grpcError(code: number, details: string): grpc.ServiceError {
  return {
    name: "ServiceError",
    message: details,
    code,
    details,
    metadata: new grpc.Metadata(),
  } as grpc.ServiceError;
}

function domainGrpcError(error: unknown): grpc.ServiceError {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("INSUFFICIENT_STOCK:")) {
    return grpcError(grpc.status.FAILED_PRECONDITION, "Insufficient stock");
  }
  if (message.startsWith("RESERVATION_CONFLICT:") ||
      message.startsWith("RESERVATION_HASH_MISMATCH:")) {
    return grpcError(grpc.status.ALREADY_EXISTS, "Reservation identity conflict");
  }
  if (message.startsWith("INVALID_RESERVATION:")) {
    return grpcError(grpc.status.INVALID_ARGUMENT, "Invalid reservation request");
  }
  return grpcError(grpc.status.INTERNAL, "Reservation operation failed");
}

server.addService(productProto.product.ProductService.service, {
  getProduct: async (call: any, callback: any) => {
    try {
      const product = await prisma.product.findUnique({ where: { id: call.request.id } });
      if (!product) {
        return callback(grpcError(grpc.status.NOT_FOUND, "Product not found"));
      }
      callback(null, product);
    } catch {
      callback(grpcError(grpc.status.INTERNAL, "Could not fetch product"));
    }
  },

  // Legacy endpoints remain for compatibility. Checkout uses ReserveStock so
  // multiple products are updated atomically in one Product Service transaction.
  decrementStock: async (call: any, callback: any) => {
    const { id, quantity } = call.request;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return callback(grpcError(grpc.status.INVALID_ARGUMENT, "Invalid quantity"));
    }
    try {
      const result = await prisma.product.updateMany({
        where: { id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (result.count !== 1) {
        return callback(grpcError(grpc.status.FAILED_PRECONDITION, "Insufficient stock"));
      }
      callback(null, { success: true, message: "Stock reduced" });
    } catch {
      callback(grpcError(grpc.status.INTERNAL, "Failed to reduce stock"));
    }
  },

  incrementStock: async (call: any, callback: any) => {
    const { id, quantity } = call.request;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return callback(grpcError(grpc.status.INVALID_ARGUMENT, "Invalid quantity"));
    }
    try {
      await prisma.product.update({
        where: { id },
        data: { stock: { increment: quantity } },
      });
      callback(null, { success: true, message: "Stock restored" });
    } catch {
      callback(grpcError(grpc.status.INTERNAL, "Failed to restore stock"));
    }
  },

  reserveStock: async (call: any, callback: any) => {
    try {
      const request = call.request;
      const result = await reserveStock({
        reservationId: request.reservation_id,
        orderId: request.order_id,
        requestHash: request.request_hash,
        items: (request.items ?? []).map((item: any) => ({
          productId: item.product_id,
          quantity: item.quantity,
        })),
      });

      callback(null, {
        reservation_id: result.reservationId,
        status: result.status,
        items: result.items.map((item) => ({
          product_id: item.productId,
          product_name: item.productName,
          unit_price: item.unitPrice,
          quantity: item.quantity,
        })),
      });
    } catch (error) {
      callback(domainGrpcError(error));
    }
  },

  getReservation: async (call: any, callback: any) => {
    try {
      const result = await getReservation(
        call.request.reservation_id,
        call.request.request_hash,
      );
      if (!result) {
        return callback(grpcError(grpc.status.NOT_FOUND, "Reservation not found"));
      }

      callback(null, {
        reservation_id: result.reservationId,
        status: result.status,
        items: result.items.map((item) => ({
          product_id: item.productId,
          product_name: item.productName,
          unit_price: item.unitPrice,
          quantity: item.quantity,
        })),
      });
    } catch (error) {
      callback(domainGrpcError(error));
    }
  },

  releaseStock: async (call: any, callback: any) => {
    try {
      const result = await releaseStock(
        call.request.reservation_id,
        call.request.request_hash,
      );
      callback(null, { reservation_id: result.reservationId, status: result.status });
    } catch (error) {
      callback(domainGrpcError(error));
    }
  },
});

const PORT = Number(process.env.GRPC_PORT || 50051);
server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (error, port) => {
    if (error) {
      console.error("Failed to bind Product Service gRPC server", error);
      process.exitCode = 1;
      return;
    }
    console.log(`Product gRPC server listening on ${port}`);
  },
);
