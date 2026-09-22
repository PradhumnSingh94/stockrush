import { Router } from "express";
import { CreateOrderDtoSchema } from "@stockrush/shared";
import { validate } from "../middleware/validate";
import { OrderService } from "../services/order.service";
import { CorrelatedRequest } from "../middleware/correlation";

export const orderRouter: Router = Router();

// orderRouter.get("/", async (req, res) => {
//   const orders = await OrderService.list();
//   res.json(orders);
// });

// orderRouter.get("/:id", async (req, res) => {
//   const order = await OrderService.findById(req.params.id);
//   res.json(order);
// });

orderRouter.post(
  "/",
  validate(CreateOrderDtoSchema),
  async (req: CorrelatedRequest, res) => {
    req.log?.info({ msg: "Creating new order" });
    const order = await OrderService.create(req.body, req.correlationId!);
    if (typeof order === "string") {
      req.log?.error({ msg: "Order creation failed", detail: order });
      return res.status(500).json({ error: order });
    }
    req.log?.info({ orderId: order.id, msg: "New order created" });
    res.status(201).json(order);
  },
);
