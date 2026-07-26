package com.example.sell;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Synthetic REST controller for the qs/sell fixture.
 *
 * The endpoint literal is "qs/sell" (P0).
 * The controller delegates to {@link SellService}.
 */
@Path("qs/sell")
@Produces(MediaType.APPLICATION_JSON)
public class SellController {

    private final SellService sellService;

    public SellController(SellService sellService) {
        this.sellService = sellService;
    }

    @POST
    public Sell create(Sell sell) {
        return sellService.create(sell);
    }
}
