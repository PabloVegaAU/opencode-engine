package com.example.sell;

import java.util.List;

/**
 * Synthetic service used by {@link SellController}.
 *
 * The service creates a {@link Sell} and its {@link SellDetail} list.
 */
public class SellService {

    public Sell create(Sell sell) {
        List<SellDetail> details = sell.getDetails();
        for (SellDetail d : details) {
            d.setSellId(sell.getId());
        }
        return sell;
    }
}
