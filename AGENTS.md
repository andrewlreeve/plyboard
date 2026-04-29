# Plywood

Plywood is a safe ecommerce agent runner. It gives ecommerce operators a UI for running powerful CLI-native AI agents without touching a terminal or risking their local machine, credentials, or production store.

## Problem

The most capable agent workflows often require CLI access: Codex, MCP servers, Shopify AI Toolkit, scripts, repo tools, and other developer-oriented automation. Most ecommerce operators have never used a terminal and should not need to install local tooling, configure credentials, wire MCP servers, run shell commands, or reason about which actions could damage production.

Running these agents directly on a local machine also creates operational risk: exposed credentials, uncontrolled writes, broken storefronts, bad product publishes, inventory mistakes, or destructive actions against live systems.

## Product

Plywood lets retailers run prebuilt ecommerce Agent Blueprints. Each blueprint packages:

- Agents and prompts
- Commerce-specific tools
- Docker SBX sandbox template
- Commerce integrations
- Secrets policy
- Manifest schema
- Safety rules
- Approval gates
- Audit trail
- Rollback plan

The operator never touches the terminal. Agents run in isolated Docker SBX sandboxes. Every proposed action is converted into a structured action manifest and classified by Plywood as `safe`, `needs_approval`, or `blocked` before anything can affect production.

## Demo Scope

Build the Product Readiness QA Blueprint.

This blueprint runs two mocked agents inside prebuilt Docker SBX Agent Blueprints:

1. Catalog QA Agent
   Reviews draft Shopify products before launch. Checks enrichment, descriptions, SEO titles, meta descriptions, tags, variants, image alt text, photo quality, missing media, collection assignment, and publish readiness.

2. Storefront Merchandising Agent
   Reviews the live storefront and existing products. Checks visual merchandising, collection presentation, product card quality, image consistency, missing enrichment, weak product positioning, and whether products are being presented correctly.

For the hackathon, mock Docker SBX/Codex execution. Present the architecture clearly as sandboxed CLI agents running inside prebuilt ecommerce blueprints with the right tools, policies, and schemas.

## Core Flow

1. Operator chooses Product Readiness QA Blueprint.
2. Operator selects store target and safety mode.
3. Plywood runs the Catalog QA Agent and Storefront Merchandising Agent in a mocked Docker SBX blueprint.
4. Agents return one structured action manifest.
5. Plywood applies the policy engine.
6. Safe draft fixes and audit recommendations are allowed.
7. Publishing, live merchandising changes, and production writes require approval.
8. Destructive or risky actions are blocked.
9. Operator reviews the manifest, audit packet, and rollback plan.

## User Inputs

- Store target: `demo`, `dev`, `staging`, `production`
- Safety mode: `read-only`, `draft-only`, `staging write`, `production requires approval`
- QA criteria:
  - Required fields
  - Image standards
  - Collection rules
  - Tone of voice
  - SEO guidelines
- Run button

## Action Policy Examples

Safe actions:

- `product.read`
- `product.enrichment_draft`
- `product.seo_draft`
- `product.image_alt_text_draft`
- `product.media_issue_flag`
- `product.publish_readiness_check`
- `storefront.product_quality_audit`
- `collection.merchandising_recommendation`

Needs approval:

- `product.publish`
- `product.publish.ready`
- `collection.publish`
- `collection.sort_update`
- `product.update_price`
- `inventory.update`

Blocked:

- `product.media_delete`
- `inventory.decrement`
- `theme.publish.production`
- `customer.email_send`
- `payment.capture`
- `refund.create`
- `admin_user.create`
- `webhook.create`

## Review UI Requirements

The app should show:

- Blueprint name
- Runtime: Docker SBX
- Agents completed
- Agent/toolkit used
- Target environment
- Safety mode
- Count of safe, approval-required, and blocked actions
- Product QA findings grouped by product
- Storefront merchandising findings
- Proposed actions with before/after, risk, policy result, reasoning, and rollback note
- Audit packet generated
- Rollback plan generated
- Mock buttons for "Approve selected" and "Export audit packet"

## Product Feel

Plywood should feel like a serious commerce operations console, not a marketing page. The first screen should be the usable workflow, not a landing page. Prioritize clarity, reviewability, safety, and confidence. Use rich mocked data. Do not overbuild real integrations for the demo.

## Shared Context Mounts

Plywood should support mounting shared agent context into a blueprint run. The default injected context folder is the top-level `context/` directory in the Plywood workspace. When it exists, it is mounted read-only into the sandbox at `/plywood/context`.

This can include a shared `AGENTS.md` file and/or other context and instruction files, such as:

- Brand voice and positioning
- Product taxonomy rules
- Collection strategy
- Merchandising standards
- SEO guidelines
- Image and media requirements
- Safety and approval preferences
- How agents should act for this retailer

The mounted context is read-only inside the sandbox and should be treated as run-time instruction context for the agents. It must be visible in the review UI so the operator can understand which brand or operational instructions influenced the manifest.

`.plywood/` is reserved for internal runtime state such as config, latest-run pointers, and caches. Do not mount `.plywood/` into the sandbox as shared context.

## Sandbox Creation And Execution

Plywood should create sandboxes from blueprints. The first concrete command is:

```bash
plywood create
```

With no blueprint id, Plywood loads the default blueprint from `blueprint/default.json`. The blueprint file owns the underlying runtime agent adapter. This creates a sandbox plan using the current workspace as the writable SBX workspace and automatically injects the default `context/` folder as a read-only workspace.

Plywood should own the full operator flow. Operators should not need to run `sbx` directly. Follow the SBX command model:

```bash
plywood run
plywood exec
```

`plywood run` starts or attaches to an interactive sandbox session. `plywood exec` executes a non-interactive command or blueprint workflow inside the sandbox.

Plywood may add opinions on top of the SBX pattern, including default context injection, SBX secrets policy recording, generated sandbox specs, and safety/audit metadata. Raw API secrets must still stay outside the sandbox.

## SBX Secrets Policy

Plywood should follow the SBX standard: do not share Shopify API secrets, app credentials, customer credentials, or production tokens directly with the sandbox.

Agents should call scoped tools or API broker endpoints instead of receiving raw secrets. The host-side broker owns credential access, injects credentials only into outbound commerce API calls, applies allowlists and policy checks, and returns scoped responses to the sandbox. The sandbox should receive tool results and manifest data, not reusable API secrets.

This keeps credentials off the operator's local machine and out of the agent sandbox while still allowing agents to inspect products, draft safe changes, and propose controlled production actions.
