# 0001 — batched import

The qs/sell pilot batches imports every 30s. The batch window is
configured in `BatchImport.batchWindowSeconds`. The reason is
peak-time load management.
