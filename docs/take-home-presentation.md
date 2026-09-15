# Take-home presentation notes

## Submission blurb

OrderCue is a local-first Chrome side panel for people who need to do real work after an Amazon order arrives: track follow-up and reimbursement state, remember the next action, and prepare a reviewed Facebook Marketplace listing without retyping the order. Amazon’s history is good at showing what shipped; spreadsheets are flexible but depend on manual copying. OrderCue captures the order in context and turns it into a small, durable queue that still works offline.

For this take-home, I extended an existing personal tool with an agent-safe access layer and a live Vercel demo. One Rust application layer now serves REST, modern remote MCP, and an installable JSON CLI. Agents may list, search, inspect, or update one status or note; creation, deletion, batch mutation, and raw database access are intentionally unavailable. The browser demo uses the real side-panel UI with local sample data, so reviewers can exercise the workflow without installing an unpacked extension.

## 20-minute demo

### 0:00–3:00 — The problem

- Start with the user: a frequent buyer, product tester, or small reseller.
- Show the current fragmentation: Amazon order history, a follow-up note or sheet, then a Marketplace form.
- Make the failure concrete: the order exists, but the next action does not.
- State the thesis: capture in context, then make unfinished work obvious.

### 3:00–9:00 — The product

1. Open an Amazon order and save it without retyping.
2. Open the side panel and show local-first/offline language.
3. Search, filter, and move one order through the status workflow.
4. Edit a note; point out explicit save/discard behavior.
5. Show a no-result state and the delete confirmation.
6. Preview the Marketplace handoff and explain that posting remains human-reviewed.
7. Open the Vercel demo and explain why extension-only actions are labeled instead of simulated.

### 9:00–15:00 — The code

- `LocalStorageRepository`: the immediate working copy.
- `SyncQueue`: deduplication, retries, and optional cloud replication.
- `OrderApplication`: tenant-scoped domain operations separated from Axum routes.
- `Principal`: token scopes intersected with a client capability ceiling.
- REST, MCP, and CLI adapters: one application boundary, five agent-safe operations, no create/delete surface.
- `browserMock.ts`: the smallest adapter required to deploy the real side-panel UI as a safe web demo.

### 15:00–18:00 — Decisions and cuts

- Extension instead of a CRUD site because the capture point is the product.
- Local-first instead of cloud-required because the data is personal and the workflow is lightweight.
- CLI and MCP share the same capability ceiling; protocol choice does not change authority.
- No embedded LLM because deterministic state changes are cheaper, safer, and easier to trust.
- Cut auto-posting, broad agent writes, multi-store support, and collaborative editing.

### 18:00–20:00 — AI journey and next step

- AI helped implement across TypeScript and Rust, generate tests, inspect edge cases, and iterate on the compact interface.
- I took over at the product boundaries: what the agent may mutate, what the demo may pretend to do, and which features were unnecessary.
- The next step is validating Cognito OAuth end to end with the target MCP hosts and a production-safe native CLI callback, followed by real-user observation of whether notes and statuses are the right primitives.

## Questions I expect

### Why not Next.js?

The primary surface is a Chrome side panel and content scripts, so WXT is the appropriate runtime. I use Vercel to host the shareable production build of the demo. Adding a second application framework to the core product would duplicate UI and create architecture for the interview rather than the user.

### Why not add AI-generated listing copy?

The existing handoff is deterministic and reviewable. A model could help later, but only after observing where users actually edit the template. Adding generation now would be a thin feature with new latency, cost, and failure states.

### Why both a CLI and MCP?

The CLI is portable and easy for Skill-capable agents to install; MCP gives compatible hosts native tool discovery and structured results. Both are adapters over the same application and capability model, so supporting two clients does not create two definitions of what an agent may do.

### Why last-write-wins?

Orders are owned by one user and the mutable fields are a status and short note. A more complex merge model would be speculative. The tradeoff is documented: this would need to change before collaborative editing.

### What is the highest-risk decision?

Authentication across distributed clients. The server-side capability model is complete, but native CLI callbacks and each MCP host's Cognito registration/redirect behavior still require real production OAuth validation. The current environment-token seam is useful for controlled CLI automation, not the final consumer onboarding.

## Final submission checklist

- [ ] Merge the take-home branch into the public repository.
- [ ] Run `just check` on an unrestricted local environment.
- [ ] Authenticate Vercel CLI and run `vercel --prod` from the repository root.
- [ ] Add the live URL to the README and this submission.
- [ ] Verify the live demo in a signed-out browser at desktop and 320 px widths.
- [ ] Run the MCP `2026-07-28` conformance suite and one real-host OAuth flow.
- [ ] Send repository, live URL, README, and the two-paragraph blurb at least 24 hours before the presentation.
