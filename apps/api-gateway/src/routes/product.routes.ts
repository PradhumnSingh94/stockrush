import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { ProductClient } from "../services/product.client";
import { CreateProductDtoSchema } from "@stockrush/shared";
import { CorrelatedRequest } from "../middleware/correlation";
import { limitProductRead, limitProductWrite } from "../middleware/ratelimiter";

export const productRouter: Router = Router();

productRouter.get(
  "/",
  limitProductRead,
  async (req: CorrelatedRequest, res) => {
    const products = await ProductClient.list(req.correlationId!);
    res.json(products);
  },
);

productRouter.get(
  "/:id",
  limitProductRead,
  async (req: CorrelatedRequest, res) => {
    const product = await ProductClient.findById(
      req.params.id,
      req.correlationId!,
    );
    res.json(product);
  },
);

productRouter.post(
  "/",
  authenticate,
  limitProductWrite,
  validate(CreateProductDtoSchema),
  async (req: CorrelatedRequest, res) => {
    const product = await ProductClient.create(req.body, req.correlationId!);
    res.status(201).json(product);
  },
);
