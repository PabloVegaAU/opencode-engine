# qs/sell quipusoft-core

The core domain of the qs/sell pilot. Contains:

- `entity/NotaService.java` — the entity service. The `NotaService.listar` identifier is the canonical first query.
- `entity/Importacion.java` — the entity representation.
- `core/BatchImport.java` — the batched import core.

The pilot searches `entity/` and `core/` for the qs/sell flow. The
v0.5.0 benchmark uses the same directories.
