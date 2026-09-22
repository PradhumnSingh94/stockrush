import { Router } from "express";
import { CreateProductDtoSchema } from "@stockrush/shared";
import { ProductService } from "../services/product.services";
import { validate } from "../middleware/validate";
import { CorrelatedRequest } from "../middleware/correlation";

export const productRouter: Router = Router();

productRouter.get("/", async (req: CorrelatedRequest, res) => {
  req.log?.info({ msg: "Fetching all products" });
  const products = await ProductService.list();
  req.log?.info({ msg: "Products fetched" });
  res.json(products);
});

productRouter.get("/:id", async (req: CorrelatedRequest, res) => {
  req.log?.info({ productId: req.params.id, msg: "Fetching product" });
  const product = await ProductService.findById(req.params.id);
  req.log?.info({ productId: req.params.id, msg: "Product fetched" });
  res.json(product);
});

productRouter.post(
  "/",
  validate(CreateProductDtoSchema),
  async (req: CorrelatedRequest, res) => {
    req.log?.info({ msg: "Received product creation request" });
    const product = await ProductService.create(req.body);
    req.log?.info({ productId: product.id, msg: "Product created" });
    res.status(201).json(product);
  },
);

productRouter.post("/:id/decrement", async (req: CorrelatedRequest, res) => {
  req.log?.info({
    productId: req.params.id,
    msg: "Received stock decrement request",
  });
  const { quantity } = req.body;
  const result = await ProductService.decrementStock(req.params.id, quantity);
  req.log?.info({ productId: req.params.id, msg: "Stock decremented" });
  res.json(result);
});
