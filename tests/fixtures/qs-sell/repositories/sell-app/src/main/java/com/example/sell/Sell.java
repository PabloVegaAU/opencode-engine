package com.example.sell;

import java.util.List;

/**
 * Synthetic entity representing a sale.
 *
 * Contains a list of {@link SellDetail} line items.
 */
public class Sell {
    private String id;
    private String customerId;
    private List<SellDetail> details;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public List<SellDetail> getDetails() { return details; }
    public void setDetails(List<SellDetail> details) { this.details = details; }
}
