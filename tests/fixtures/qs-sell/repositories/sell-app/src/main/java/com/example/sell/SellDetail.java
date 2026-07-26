package com.example.sell;

/**
 * Synthetic entity representing a line item in a {@link Sell}.
 */
public class SellDetail {
    private String sellId;
    private String productId;
    private int quantity;
    private long unitPrice;

    public String getSellId() { return sellId; }
    public void setSellId(String sellId) { this.sellId = sellId; }
    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public long getUnitPrice() { return unitPrice; }
    public void setUnitPrice(long unitPrice) { this.unitPrice = unitPrice; }
}
