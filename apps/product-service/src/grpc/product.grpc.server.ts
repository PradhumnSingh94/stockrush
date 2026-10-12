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

// 2. Get the directory of that package.json
const sharedRoot = path.dirname(sharedPackageJson);

// 3. Manually join the path to the proto file
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

// Implementation of the gRPC methods
server.addService(productProto.product.ProductService.service, {
  // GET PRODUCT
  getProduct: async (call: any, callback: any) => {
    try {
      const product = await prisma.product.findUnique({
        where: { id: call.request.id },
      });

      if (!product) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: "Product not found",
        });
      }
      callback(null, product);
    } catch (err) {
      callback(err);
    }
  },

  // DECREMENT STOCK
  decrementStock: async (call: any, callback: any) => {
    const { id, quantity } = call.request;
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { stock: { decrement: quantity } },
      });
      callback(null, { success: true, message: "Stock reduced" });
    } catch (err) {
      callback(null, { success: false, message: "Failed to reduce stock" });
    }
  },

  // INCREMENT STOCK (Compensation)
  incrementStock: async (call: any, callback: any) => {
    const { id, quantity } = call.request;
    try {
      await prisma.product.update({
        where: { id },
        data: { stock: { increment: quantity } },
      });
      callback(null, { success: true, message: "Stock restored" });
    } catch (err) {
      callback(err);
    }
  },

  reserveStock: async (call: any, callback: any) => {
    try {
      const result = await reserveStock({
        reservationId: call.request.reservation_id,
        orderId: call.request.order_id,
        requestHash: call.request.request_hash,
        items: call.request.items.map((item: any) => ({
          productId: item.product_id,
          quantity: item.quantity,
        })),
      });

      callback(null, {
        reservation_id: result.reservationId,
        status: result.status,
        items: result.items.map((item: any) => ({
          product_id: item.productId,
          product_name: item.productName,
          unit_price: item.unitPrice.toString(),
          quantity: item.quantity,
        })),
      });
    } catch (error: any) {
      const insufficient = String(error?.message).startsWith(
        "INSUFFICIENT_STOCK:",
      );

      callback({
        code: insufficient
          ? grpc.status.FAILED_PRECONDITION
          : grpc.status.INTERNAL,
        details: insufficient ? "Insufficient stock" : "Reservation failed",
      });
    }
  },

  getReservation: async (call: any, callback: any) => {
    try {
      const result = await getReservation(call.request.reservation_id);

      if (!result) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: "Reservation not found",
        });
      }

      callback(null, {
        reservation_id: result.id,
        status: result.status,
        items: result.items.map((item: any) => ({
          product_id: item.productId,
          product_name: item.productName,
          unit_price: item.unitPrice.toString(),
          quantity: item.quantity,
        })),
      });
    } catch {
      callback({
        code: grpc.status.INTERNAL,
        details: "Could not query reservation",
      });
    }
  },

  releaseStock: async (call: any, callback: any) => {
    try {
      const result = await releaseStock(call.request.reservation_id);

      callback(null, {
        reservation_id: result.reservationId,
        status: result.status,
      });
    } catch {
      callback({
        code: grpc.status.INTERNAL,
        details: "Could not release reservation",
      });
    }
  },
});

// Start the server
const PORT = process.env.GRPC_PORT || "50051";
server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  () => {
    console.log(`🚀 Product gRPC Server running on port ${PORT}`);
  },
);
