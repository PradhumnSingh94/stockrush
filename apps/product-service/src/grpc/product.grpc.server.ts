import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { prisma } from "../db/prisma.client"; // Your Product Service Prisma client

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
