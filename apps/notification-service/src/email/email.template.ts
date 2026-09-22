import { OrderConfirmedEvent } from "@stockrush/shared";

export function orderConfirmedTemplate(dto: OrderConfirmedEvent): {
  subject: string;
  html: string;
} {
  const { orderId, items } = dto.payload;

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.productName}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">$${item.unitPrice.toFixed(2)}</td>
        </tr>
      `,
    )
    .join("");

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  return {
    subject: `Order Confirmed — #${orderId.slice(0, 8).toUpperCase()}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your order is confirmed!</h2>
        <p>Order ID: <strong>#${orderId.slice(0, 8).toUpperCase()}</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; text-align: left;">Product</th>
              <th style="padding: 8px; text-align: left;">Qty</th>
              <th style="padding: 8px; text-align: left;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
        <p style="margin-top: 20px; font-size: 18px;">
          <strong>Total: $${total.toFixed(2)}</strong>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          Thank you for shopping with StockRush.
        </p>
      </div>
    `,
  };
}
