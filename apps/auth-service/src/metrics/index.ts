import { Counter, registry } from "@stockrush/shared";

export const loginAttemptsCounter = new Counter({
  name: "auth_service_login_attempts_total",
  help: "Total login attempts",
  labelNames: ["success"],
  registers: [registry],
});

export const registrationCounter = new Counter({
  name: "auth_service_registrations_total",
  help: "Total user registrations",
  registers: [registry],
});

export const tokenIssuedCounter = new Counter({
  name: "auth_service_tokens_issued_total",
  help: "Total Paseto tokens issued",
  registers: [registry],
});
