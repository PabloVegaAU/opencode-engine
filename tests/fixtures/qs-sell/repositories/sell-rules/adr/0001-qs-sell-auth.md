# 0001 — qs/sell endpoint requires authentication

The qs/sell endpoint at `@Path("qs/sell")` requires authentication
because sells carry customer data. The auth check is performed before
the controller delegates to `SellService.create`.
