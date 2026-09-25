import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom metrics
const orderSuccess = new Counter("orders_successful");
const orderFailed = new Counter("orders_failed");
const errorRate = new Rate("error_rate");
const orderDuration = new Trend("order_duration");

const BASE_URL =
  "http://acb35a4f9d90140fb99b80960901fcc0-517032731.us-east-1.elb.amazonaws.com:3000";

// Product IDs from your seeded data
const PRODUCT_IDS = [
  "affc46bd-5257-49d5-84b8-bb3025700027", // Nike Air Max — stock 50
  "0434c96f-89fb-49da-ab6b-3281cfa7f385", // Sony WH-1000XM6 — stock 30
  "89cdb168-33b6-47b0-9fc8-53c34893d3b2", // Apple Watch — stock 10
];

// Test stages
export const options = {
  scenarios: {
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "1m", target: 200 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.1"],
    error_rate: ["rate<0.1"],
  },
};

// Login once and reuse token
export function setup() {
  // Try register — ignore if already exists
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email: "loadtest@example.com",
      password: "password123",
      name: "Load Test User",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  // Always login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: "loadtest@example.com",
      password: "password123",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  const body = JSON.parse(loginRes.body);
  console.log("Login status:", loginRes.status);
  console.log("User ID:", body.user?.id);

  return { token: body.token, userId: body.user?.id };
}

export default function (data) {
  const { token, userId } = data;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 1. Browse products
  const productsRes = http.get(`${BASE_URL}/api/products`, { headers });
  check(productsRes, {
    "products status 200": (r) => r.status === 200,
  });
  errorRate.add(productsRes.status !== 200);

  sleep(0.5);

  // 2. Create order — pick random product
  const productId = PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
  const start = Date.now();

  const orderRes = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({
      userId: userId,
      userEmail: "loadtest@example.com",
      items: [{ productId, quantity: 1 }],
    }),
    { headers },
  );

  if (orderRes.status !== 201) {
    console.log(`Order failed: ${orderRes.status} - ${orderRes.body}`);
  }

  const duration = Date.now() - start;
  orderDuration.add(duration);

  const orderOk = check(orderRes, {
    "order created": (r) => r.status === 201,
    "order confirmed": (r) => {
      try {
        return JSON.parse(r.body).status === "CONFIRMED";
      } catch {
        return false;
      }
    },
  });

  if (orderOk) {
    orderSuccess.add(1);
  } else {
    orderFailed.add(1);
  }

  errorRate.add(orderRes.status !== 201);

  sleep(1);
}

export function teardown(data) {
  console.log("Load test complete");
}
