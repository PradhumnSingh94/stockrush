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
  process.env.PRODUCT_GRPC_URL || "localhost:50051",
  grpc.credentials.createInsecure(),
);

function unary<T>(
  method: (request: any, callback: (error: any, response: T) => void) => any,
  request: unknown,
  timeoutMs = 2500,
): Promise<T> {
  return new Promise((resolve, reject) => {
    method.call(
      client,
      request,
      { deadline: new Date(Date.now() + timeoutMs) },
      (error: grpc.ServiceError | null, response: T) => {
        if (error) reject(error);
        else resolve(response);
      },
    );
  });
}

export const productClient = {
  get: (productId: string) => unary<any>(client.GetProduct, { id: productId }),
  decrement: (productId: string, quantity: number) =>
    unary<any>(client.DecrementStock, { id: productId, quantity }),
  increment: (productId: string, quantity: number) =>
    unary<any>(client.IncrementStock, { id: productId, quantity }),
  reserveStock: (request: {
    reservation_id: string;
    order_id: string;
    request_hash: string;
    items: Array<{ product_id: string; quantity: number }>;
  }) => unary<any>(client.ReserveStock, request),

  getReservation: (reservationId: string, requestHash: string) =>
    unary<any>(client.GetReservation, {
      reservation_id: reservationId,
      request_hash: requestHash,
    }),

  // Deliberately separate from the reservation breaker.
  releaseStock: (reservationId: string) =>
    unary<any>(client.ReleaseStock, { reservation_id: reservationId }, 4000),
};
