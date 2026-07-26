package com.quipusoft.qssell.core;

/**
 * Why is the import batched every 30s?
 * The batch window is 30s; the worker flushes every 30s by config.
 * The knowledge adapter must find this rationale in docs.
 */
public class BatchImport {
    private int batchWindowSeconds = 30;
}
