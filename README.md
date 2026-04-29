<p align="center">
  <img src="assets/plyboard-logo.svg" width="560" alt="Plyboard">
</p>

<p align="center">
  <strong>YOLO-mode AI agents for ecommerce, without blowing up production.</strong>
</p>

## The Short Version

Plyboard lets ecommerce teams use AI agents to do store chores safely.

Pick a job, like checking new products before launch. Plyboard sends the right AI helpers to review the store, draft fixes, and show you exactly what they want to change.

Before anything risky goes live, you get a clear review screen:

- Things that are safe.
- Things that need your approval.
- Things Plyboard blocked.

No terminal commands for store operators. No local setup. No store keys sitting on someone's laptop. No mystery changes to your live store.

## Why It Exists

AI agents are getting useful enough to help D2C brands with real store work: product launches, catalog cleanup, photo checks, product descriptions, collection reviews, and merchandising QA.

The catch: the most powerful agents usually need technical setup and admin-style access. That often means developer tools, secret credentials, and commands running from someone's computer.

That is too much risk for normal store ops. One bad run can publish the wrong product, break a collection, expose credentials, or change live store data before anyone has checked the work.

## The Solution

Plyboard gives the AI a safe place to work and gives the operator the final say.

For each store job, Plyboard uses a prebuilt blueprint with the right AI helpers, brand instructions, store tools, safety rules, approval steps, and rollback notes.

The AI can inspect and draft. Plyboard decides what is safe, what needs approval, and what should be blocked. The operator reviews the plan before production changes happen.

Plyboard was built as part of the OpenAI Codex Hackathon Sydney.

## Current Demo

The demo is **Product Readiness QA**.

It checks whether new products are ready to publish and whether the live storefront is presenting products properly.

It uses two AI helpers:

- **Catalog QA Agent:** reviews draft products for missing enrichment, weak descriptions, SEO gaps, tags, variants, image alt text, photo quality, collection fit, and publish readiness.
- **Storefront Merchandising Agent:** reviews the live storefront for product presentation, collection merchandising, product card quality, image consistency, weak positioning, and existing enrichment gaps.

For the hackathon demo, store actions are mocked. The important part is the flow: run the agents, review the proposed changes, approve what is safe, and block what should not happen.

## For Builders

The current milestone is a CLI product kernel. Under the hood, Plyboard models CLI-native ecommerce agents running inside Docker SBX-style sandboxes.

The mocked Product Readiness QA Blueprint produces a structured action manifest, classifies every proposed action as `safe`, `needs_approval`, or `blocked`, and writes reviewable audit artifacts.

Plyboard's intended architecture:

- Agents run in isolated blueprints.
- Retailer context is mounted read-only from `context/`.
- Raw Shopify and commerce API secrets stay outside the sandbox.
- Proposed changes become structured manifests before execution.
- Audit packets and rollback plans are generated for review.

## Quick Start

```bash
npm install
npm test
```

List and inspect the available blueprint:

```bash
npm run plyboard -- blueprint list
npm run plyboard -- blueprint inspect
```

Check the shared context and create the default sandbox plan:

```bash
npm run plyboard -- context status
npm run plyboard -- create --dry-run
```

Use SBX-style semantics through Plyboard:

```bash
npm run plyboard -- run --dry-run
npm run plyboard -- exec --target demo --safety-mode draft-only
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
./bin/plyboard.mjs exec --target demo --safety-mode draft-only
```

## CLI

```bash
plyboard init [--force]
plyboard create [blueprint-id] [PATH...] [--context ./notes.md] [--dry-run] [--json]
plyboard run [blueprint-id|sandbox-name] [--dry-run] [--json]
plyboard exec [blueprint-id|sandbox-name] [--target demo --safety-mode draft-only] [-- <command>]
plyboard context init [--force] [--json]
plyboard context status [--json]
plyboard blueprint list [--json]
plyboard blueprint inspect [blueprint-id] [--json]
plyboard review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
plyboard approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
plyboard approve latest --all-needs-approval [--actor operator]
plyboard export-audit [latest|run-id|run-dir] [--out exports/my-run]
```

## Command Model

Plyboard follows the SBX command model while keeping SBX behind Plyboard:

- `create` prepares a sandbox from a blueprint.
- `run` starts or attaches to the sandbox interactively.
- `exec` runs a non-interactive command or blueprint workflow.

With no blueprint id, Plyboard reads `blueprint/default.json` and uses the default blueprint.

## How Plyboard Keeps Things Safe

Plyboard starts careful and stays careful.

- Safe work can be drafted automatically, like product copy, SEO suggestions, image alt text, photo issue flags, storefront audits, and merchandising recommendations.
- Risky work needs approval, like publishing products, changing collection order, updating prices, or editing inventory.
- Dangerous work is blocked, like deleting product media, sending customer emails, capturing payments, issuing refunds, or publishing a production theme.

The demo also models the intended sandbox boundary:

- Raw Shopify/API secrets are never passed into the sandbox.
- Agents call limited store tools instead of holding reusable credentials.
- The host side owns credential access and returns only the results the agent needs.
- Blocked actions remain non-executable and are included for audit visibility.

## Brand Context

Plyboard auto-mounts the top-level `context/` folder into every sandbox and workflow execution when it exists.

The mount contract:

- Local path: `./context`
- Sandbox path: `/plyboard/context`
- Mode: read-only
- Secrets: forbidden

Use `context init` to create starter files in a new workspace:

```bash
npm run plyboard -- context init
```

Use `--context` for one-off extra files or folders. Extra mounts are placed under `/plyboard/context/extra/...` in the manifest:

```bash
npm run plyboard -- exec --context ./examples/brand-context
```

Plyboard records context mount paths, sandbox paths, hashes, previews, and read-only status in the manifest. It refuses obvious secret-like paths such as `.env`, `.pem`, `.key`, or files named with `secret` or `credential`.

## Sandbox Creation

Plyboard creates sandboxes from blueprint definitions:

```bash
npm run plyboard -- create
```

With no blueprint id, Plyboard reads `blueprint/default.json` and uses that blueprint. The blueprint file defines the underlying runtime agent adapter. By default, Plyboard uses the current workspace as the writable sandbox workspace and injects `./context` as a read-only workspace.

The operator should not call the runtime directly. Plyboard owns sandbox creation and startup.

If the Docker SBX runtime is available, Plyboard attempts to create the sandbox through its runtime adapter. If it is not available, Plyboard writes a creation plan to `.plyboard/sandboxes/<name>/sandbox.json`.

Use `--dry-run` to always write the plan without executing SBX:

```bash
npm run plyboard -- create --dry-run
```

Start or attach to the sandbox interactively through Plyboard:

```bash
npm run plyboard -- run
```

Run the blueprint workflow non-interactively through Plyboard:

```bash
npm run plyboard -- exec --target demo --safety-mode draft-only
```

Run an arbitrary command inside the sandbox through Plyboard:

```bash
npm run plyboard -- exec -- npm test
```

## What Gets Saved

Each blueprint workflow execution saves a folder under `runs/<run-id>/`:

- `manifest.json`: everything the agents proposed.
- `audit-packet.json`: machine-readable audit packet.
- `audit-packet.md`: human-readable audit packet.
- `rollback-plan.md`: notes for undoing approved changes.
- `broker-trace.json`: mocked store tool calls.
- `run-log.jsonl`: run events.
- `approval-record.json`: mocked approvals, created after `plyboard approve`.

The latest run pointer is stored at `.plyboard/latest-run`.
