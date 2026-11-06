# Storage v1 → v2 fixture

`storage-v2.fixture.mjs` generates a real Domain v1 fixture through `@deepseek-ai/dsh-storage-domain`'s `DomainFacility`. The test closes v1, copies the whole directory to a temporary location, opens the copy with the current Domain v2 declaration, updates one old record, inserts a v2-only record, and reopens the copy again.

Generate a standalone fixture with:

```sh
node --experimental-transform-types tests/fixtures/storage-v2.fixture.mjs .tmp/project-task-fixtures/storage-v1
```

Run the integration test with:

```sh
node --experimental-transform-types --test tests/storage-v2.fixture.test.mjs
```

## Backend boundary

This repository currently installs `@deepseek-ai/dsh-storage` (the public backend contract) and `@deepseek-ai/dsh-storage-domain` (the real Domain implementation), but does not install the shipped `@deepseek-ai/dsh-storage-json` backend. `storage-v2.fixture.mjs` therefore supplies a small file-backed `KvUnit` implementation against the public contract. Its on-disk envelope is explicitly `{ version, key, value }`; no shipped backend's private disk format is inferred or hand-written. Domain records themselves are written only through v1 `Domain.table(...).put(...)`.

This verifies real Domain v1 → v2 schema compatibility, compatible-version reads, per-record write versioning, directory-copy reopening, and v2 persistence. It is not a byte-format compatibility test for the separately distributed JSON backend. When that backend is available in the test environment, replace `openFileDomain` with its registered backend while keeping the v1 generation and v2 reopening assertions unchanged.
