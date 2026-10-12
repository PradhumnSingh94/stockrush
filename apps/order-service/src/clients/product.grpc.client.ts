import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

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
const client = new productProto.product.ProductService(
  process.env.PRODUCT_GRPC_URL || "localhost:50051",
  grpc.credentials.createInsecure(),
);

export type ReservationRpcItem = {
  product_id: string;
  product_name: string;
  unit_price: string;
  quantity: number;
};

export type ReservationRpcResponse = {
  reservation_id: string;
  status: "RESERVED" | "RELEASED" | string;
  items: ReservationRpcItem[];
};

export type ReservationRequestRpc = {
  reservation_id: string;
  request_hash: string;
};

function unary<T>(
  method: (request: unknown, options: { deadline: Date }, callback: (error: grpc.ServiceError | null, response: T) => void) => unknown,
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
  get: (productId: string) =>
    unary<any>(client.GetProduct, { id: productId }),

  // Retained for non-checkout flows. Checkout must use ReserveStock.
  decrement: (productId: string, quantity: number) =>
    unary<any>(client.DecrementStock, { id: productId, quantity }),

  increment: (productId: string, quantity: number) =>
    unary<any>(client.IncrementStock, { id: productId, quantity }),

  reserveStock: (request: {
    reservation_id: string;
    order_id: string;
    request_hash: string;
    items: Array<{ product_id: string; quantity: number }>;
  }): Promise<ReservationRpcResponse> =>
    unary<ReservationRpcResponse>(client.ReserveStock, request),

  async getReservation(
    reservationId: string,
    requestHash: string,
  ): Promise<ReservationRpcResponse | null> {
    try {
      return await unary<ReservationRpcResponse>(
        client.GetReservation,
        { reservation_id: reservationId, request_hash: requestHash },
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as grpc.ServiceError).code === grpc.status.NOT_FOUND
      ) {
        return null;
      }
      throw error;
    }
  },

  // Do not put compensation behind the reservation circuit breaker. Recovery
  // must still be able to release known reservations while new reservations fail.
  releaseStock: (
    reservationId: string,
    requestHash: string,
  ): Promise<{ reservation_id: string; status: string }> =>
    unary(client.ReleaseStock, {
      reservation_id: reservationId,
      request_hash: requestHash,
    }, 4000),
};
