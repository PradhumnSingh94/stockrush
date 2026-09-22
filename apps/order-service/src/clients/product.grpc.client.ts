import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

// Load the proto file
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

// Create the actual client
// For local development, use 'localhost:50051'.
// For Docker, use 'product-service:50051'.
const client = new productProto.product.ProductService(
  process.env.PRODUCT_SERVICE_URL || "localhost:50051",
  grpc.credentials.createInsecure(),
);

export const productClient = {
  get: (id: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      client.GetProduct({ id }, (err: any, response: any) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  },

  decrement: (id: string, quantity: number): Promise<any> => {
    return new Promise((resolve, reject) => {
      client.DecrementStock({ id, quantity }, (err: any, response: any) => {
        if (err || !response.success)
          reject(err || new Error(response.message));
        else resolve(response);
      });
    });
  },

  increment: (id: string, quantity: number): Promise<any> => {
    return new Promise((resolve, reject) => {
      client.IncrementStock({ id, quantity }, (err: any, response: any) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  },
};
