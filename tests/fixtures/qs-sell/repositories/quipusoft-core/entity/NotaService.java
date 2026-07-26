package com.quipusoft.qssell.entity;

/**
 * Entity service. The canonical identifier queried by the qs/sell pilot.
 */
public class NotaService {

    public Nota listar(String idImportacion) {
        // pilot: the implementation details are intentionally minimal.
        return new Nota(idImportacion);
    }
}
