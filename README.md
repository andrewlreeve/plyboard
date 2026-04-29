# Plyboard

Plyboard is a safe ecommerce agent runner for CLI-native AI workflows. The current milestone is the CLI product kernel: a mocked Product Readiness QA Blueprint that produces a structured action manifest, applies a policy engine, and writes reviewable audit artifacts.

## Run The Demo

```bash
npm run plyboard -- blueprint list
npm run plyboard -- blueprint inspect product-readiness-qa
npm run plyboard -- run product-readiness-qa --target demo --safety-mode draft-only --context ./examples/brand-context
npm run plyboard -- review latest
npm run plyboard -- review latest --only blocked
npm run plyboard -- approve latest --action act-005 --actor demo-operator
npm run plyboard -- export-audit latest
```

You can also run the executable directly:

```bash
./bin/plyboard.mjs run product-readiness-qa --target demo --safety-mode draft-only --context ./AGENTS.md
```

## CLI Commands

```bash
plyboard init [--force]
plyboard blueprint list [--json]
plyboard blueprint inspect <blueprint-id> [--json]
plyboard run <blueprint-id> --target demo --safety-mode draft-only [--context ./AGENTS.md]
plyboard review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
plyboard approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
plyboard approve latest --all-needs-approval [--actor operator]
plyboard export-audit [latest|run-id|run-dir] [--out exports/my-run]
```

## Artifact Layout

Each run writes a folder under `runs/<run-id>/`:

- `manifest.json`: structured action manifest
- `audit-packet.json`: machine-readable audit packet
- `audit-packet.md`: human-readable audit packet
- `rollback-plan.md`: rollback notes for proposed actions
- `broker-trace.json`: mocked host API broker calls
- `run-log.jsonl`: run events
- `approval-record.json`: mocked approvals, created after `plyboard approve`

`export-audit` includes approval records when they exist.

The latest run pointer is stored at `.plyboard/latest-run`.

## Safety Model

The mocked Docker SBX runner follows the intended SBX boundary:

- Raw Shopify/API secrets are never passed into the sandbox.
- Agents call scoped broker tools such as `shopify.product.read`.
- The host-side broker owns credential access and returns scoped results.
- Every proposed action is classified as `safe`, `needs_approval`, or `blocked`.
- Blocked actions remain non-executable and are included for audit visibility.

## Shared Context

Use `--context` to mount a read-only `AGENTS.md` or folder of brand instructions:

```bash
npm run plyboard -- run product-readiness-qa --context ./examples/brand-context
```

Plyboard records context mount paths, hashes, previews, and read-only status in the manifest. It refuses obvious secret-like paths such as `.env`, `.pem`, `.key`, or files named with `secret` or `credential`.

## Verify

```bash
npm test
```
