<p align="center">
  <img src="assets/plyboard-logo.svg" width="560" alt="Plyboard">
</p>

<p align="center">
  <strong>YOLO-mode AI agents for ecommerce, without blowing up production.</strong>
</p>

## What Plyboard Does

Plyboard helps ecommerce brands use AI agents to get store work done safely.

You choose a job, like checking new products before launch. Plyboard reviews the work, suggests fixes, shows exactly what it wants to change, and asks before anything risky goes live.

For a D2C brand, that means AI can help clean up product pages, check photos, improve descriptions, review collections, and prepare products for launch without silently changing your live store.

No terminal commands. No local setup. No raw store credentials sitting on someone's laptop. No surprise production changes.

## Why This Matters

D2C brands want AI agents that can do real work: clean up catalogs, prepare launches, review storefront quality, fix missing enrichment, audit merchandising, and update commerce systems.

But useful agents often need to act like an admin using a computer. Today that can mean terminal commands, local scripts, developer tools, API credentials, and risky workflows running from someone's machine.

That is a bad default for ecommerce operators. The learning curve is steep, and one wrong command or uncontrolled agent action can expose credentials, publish bad products, break storefront merchandising, change inventory, or touch production before anyone reviews the work.

## The Solution

Plyboard gives D2C teams a safe runner for CLI-native ecommerce agents.

Operators choose a prebuilt **Agent Blueprint** instead of opening a terminal. The blueprint packages the agents, tools, shared brand context, sandbox template, policy rules, approval gates, audit trail, and rollback plan for a specific commerce workflow.

Agents can still use powerful CLI-native workflows under the hood, but they run in isolated Docker SBX-style sandboxes. Raw Shopify and commerce API secrets stay outside the sandbox. Every proposed change becomes a structured action manifest and is classified as `safe`, `needs_approval`, or `blocked` before anything can affect production.

Plyboard was built as part of the OpenAI Codex Hackathon Sydney.

The current milestone is a CLI product kernel: a mocked **Product Readiness QA Blueprint** that runs two ecommerce agents, produces a structured action manifest, classifies every proposed action, and writes reviewable audit artifacts.

## Why Plyboard

Plyboard gives powerful agent workflows an operator-safe control surface:

- Agents run in isolated Docker SBX-style blueprints.
- Retailer context is mounted read-only through shared `AGENTS.md` files or folders.
- Raw Shopify and commerce API secrets stay outside the sandbox.
- Proposed changes become structured manifests before execution.
- Every action is classified as `safe`, `needs_approval`, or `blocked`.
- Audit packets and rollback plans are generated for review.

## Demo Blueprint

The demo blueprint is **Product Readiness QA**.

It runs two agents:

- **Catalog QA Agent:** reviews draft products for missing enrichment, weak descriptions, SEO gaps, tags, variants, image alt text, photo quality, collection fit, and publish readiness.
- **Storefront Merchandising Agent:** reviews the live storefront for product presentation, collection merchandising, product card quality, image consistency, weak positioning, and existing enrichment gaps.

For the hackathon demo, the runner is mocked. The product shape is still real: sandboxed agents, scoped tool calls, policy-gated actions, shared brand context, audit output, and rollback notes.

## Quick Start

```bash
npm install
npm test
```

List and inspect the available blueprint:

```bash
npm run plyboard -- blueprint list
npm run plyboard -- blueprint inspect product-readiness-qa
```

Run the demo with shared brand context:

```bash
npm run plyboard -- run product-readiness-qa --target demo --safety-mode draft-only --context ./examples/brand-context
```

Review the latest manifest:

```bash
npm run plyboard -- review latest
npm run plyboard -- review latest --only needs_approval
npm run plyboard -- review latest --only blocked
```

Approve a mocked action and export the audit packet:

```bash
npm run plyboard -- approve latest --action act-005 --actor demo-operator
npm run plyboard -- export-audit latest
```

You can also run the executable directly:

```bash
./bin/plyboard.mjs run product-readiness-qa --target demo --safety-mode draft-only --context ./examples/brand-context
```

## CLI

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

## Safety Model

Plyboard's default posture is conservative.

Safe actions include draft enrichment, SEO drafts, image alt text drafts, media issue flags, publish readiness checks, storefront audits, and merchandising recommendations.

Approval-required actions include product publishing, collection publishing, collection sort updates, price changes, and inventory updates.

Blocked actions include media deletion, inventory decrement, production theme publish, customer email sends, payment capture, refunds, admin user creation, and webhook creation.

The mocked Docker SBX runner follows the intended sandbox boundary:

- Raw Shopify/API secrets are never passed into the sandbox.
- Agents call scoped broker tools such as `shopify.product.read`.
- The host-side broker owns credential access and returns scoped results.
- Blocked actions remain non-executable and are included for audit visibility.

## Shared Context

Use `--context` to mount a read-only `AGENTS.md` or folder of brand instructions:

```bash
npm run plyboard -- run product-readiness-qa --context ./examples/brand-context
```

Plyboard records context mount paths, hashes, previews, and read-only status in the manifest. It refuses obvious secret-like paths such as `.env`, `.pem`, `.key`, or files named with `secret` or `credential`.

## Artifacts

Each run writes a folder under `runs/<run-id>/`:

- `manifest.json`: structured action manifest.
- `audit-packet.json`: machine-readable audit packet.
- `audit-packet.md`: human-readable audit packet.
- `rollback-plan.md`: rollback notes for proposed actions.
- `broker-trace.json`: mocked host API broker calls.
- `run-log.jsonl`: run events.
- `approval-record.json`: mocked approvals, created after `plyboard approve`.

The latest run pointer is stored at `.plyboard/latest-run`.
