# sell rules

The qs/sell flow must:
- Use the canonical `SellController.create` entry point.
- Validate authentication before creating a `Sell`.
- Persist `SellDetail` line items with the `Sell.id`.
