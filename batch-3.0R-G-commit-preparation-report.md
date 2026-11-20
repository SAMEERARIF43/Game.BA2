# STRIKE FORCE — BATCH 3.0R-G
## DEDICATED-BRANCH COMMIT PREPARATION & FINAL SCOPE RECONCILIATION REPORT

**Project:** Strike Force  
**Workspace:** `L:\Strike Force`  
**Stage:** Batch 3.0R-G — Dedicated-Branch Commit Preparation & Scope Reconciliation  
**Date:** November 19, 2026  
**Mode:** STRICT READ-ONLY — COMMIT PREPARATION AND RECONCILIATION ONLY  
**Implementation Authorization:** NOT AUTHORIZED  
**Git Mutation Authorization:** NOT AUTHORIZED  
**Commit Authorization:** NOT AUTHORIZED  
**Push / Merge / Deployment Authorization:** NOT AUTHORIZED  
**Git Commands Executed During This Stage:** EXACTLY ZERO  

---

## 1. EXECUTIVE SUMMARY

Batch 3.0R-G establishes the complete, audited preparation plan for committing the cumulative Strike Force gameplay overhaul (encompassing Batches 2.3, 3.0, and 3.0R) to a **dedicated development branch**, while strictly maintaining the zero-git-mutation constraint.

In direct accordance with the user's authoritative instructions, all three outstanding decisions from Batch 3.0R-F2 have been incorporated:
1. **Weapon Balance:** The existing weapon-stat values in `src/game/types.ts` are **APPROVED** without modification.
2. **Binary Archive (`strike-force.zip`):** The 521 KB backup is **MANDATORILY EXCLUDED** from the source milestone commit and preserved untouched on the local filesystem.
3. **Commit Destination:** The eventual milestone commit is directed to a **DEDICATED DEVELOPMENT BRANCH** (e.g., `feat/batch-3.0-gameplay-overhaul`), strictly protecting `main`.

No Git commands of any kind (neither mutative nor read-only) were executed during this stage. The ten-file milestone scope, partial-staging reconciliation procedure, exclusion registers, and safe branch-creation sequence have been independently challenged and verified by OpenCode.

---

## 2. THE THREE USER DECISIONS AND THEIR AUTHORITATIVE TREATMENT

| Decision Point | User Resolution | Concrete Engineering Treatment in Batch 3.0R-G |
|---|---|---|
| **1. Weapon Balance** | **APPROVED** | Retain existing weapon parameters in `src/game/types.ts` exactly as tuned in Batch 3.0 (MP5-SD: 24 DMG / 1.4s reload; Intervention: 110 DMG / 0.0001 ADS spread; M1911: 36 DMG / 340 RPM / 2.2x HS; M4A1: 0.0020 ADS spread). No alterations or re-normalizations are permitted. |
| **2. Binary Backup (`strike-force.zip`)** | **EXCLUDE** | Preserve the existing local file (521,621 bytes) in `L:\Strike Force\` without modification or deletion. When Git operations are separately authorized, it will be unstaged (`git restore --staged strike-force.zip`) so it remains exclusively as an untracked local archive. |
| **3. Commit Destination** | **DEDICATED DEVELOPMENT BRANCH** | Commit will **NEVER** be applied directly to `main`, `master`, or any protected branch. A new dedicated branch (e.g., `feat/batch-3.0-gameplay-overhaul`) will be branched from current HEAD, preserving the stable baseline of `main`. |

---

## 3. AUTHORIZATION AND SCOPE MATRIX FOR ALL TEN FILES

Every proposed file in the 10-file milestone scope was audited against Level 1 user requests and Level 2 approved specifications:

| File | Originating Batch | Functional Summary | Authorizing Instruction / Spec | Level | Classification | Milestone Inclusion |
|---|---|---|---|---|---|---|
| **1. `src/game/PlayerController.ts`** | Batch 2.3, 3.0, 3.0R | D1 camera flinch composition, D2 flinch decay, D3/D4/D6 Strategy B rebase; jump buffer (`0.16s`), coyote time (`0.12s`), air accel (`9.0 m/s²`), slide cancel; wheel switch debounce (`120ms`). | Step 745 (Batch 2.3), Step 845 (Batch 3.0), Step 1376 (Batch 3.0R Task 2). | 1 | A | **INCLUDE** |
| **2. `src/game/WeaponSystem.ts`** | Batch 3.0, 3.0R | Impact spark materials, tracer/decal pooling, kill confirm chime trigger, shared-material non-destructive disposal, `cycleSlot` bounds. | Step 845 (Priority 2 & 8), Step 1376 (Batch 3.0R Tasks 2 & 3). | 1 / 2 | A / B | **INCLUDE** |
| **3. `src/ui/MainMenu.tsx`** | Batch 3.0R | Standard Issue Arsenal cards (M4A1, MP5, Intervention, M1911) and expanded Quick Controls reference (Wheel, Zoom, Scoreboard). | Step 1376 (Batch 3.0R Section 4.1). | 1 | A | **INCLUDE** |
| **4. `README.md`** | Standalone Request, Batch 3.0R | Complete project technical manual, architecture breakdown, controls reference, MP5 5-shot TTK math, Babylon.js 9.36.0 badge. | Step 1362 (`write me a readme for this project on github`), Step 1376 (Tasks 1 & 4). | 1 | A | **INCLUDE** |
| **5. `src/game/EngineManager.ts`** | Batch 3.0, 3.0R | Slot cycle callback wiring (`onCycleSlot`), scoreboard visibility toggle, auto-dismissing onboarding timer, low-health heartbeat pulse (~1Hz). | Step 845 (Batch 3.0 Priorities 1, 5, 6, 7). | 2 | B | **INCLUDE** |
| **6. `src/game/types.ts`** | Batch 3.0, 3.0R-G | Tuned weapon configurations and `HudState` extensions (`showScoreboard`, `showOnboarding`, `lowHealthPulse`). | Step 845 (Priority 2 / Sub-Batch 3.0B); confirmed approved in Batch 3.0R-G. | 1 | A | **INCLUDE** |
| **7. `src/game/AudioEngine.ts`** | Batch 3.0 | Procedural Web Audio API synthesis: crystalline kill chime, equip click, edge-triggered low ammo warning tick, sub-bass heartbeat pulse. | Step 845 (Batch 3.0 Priority 7). | 2 | B | **INCLUDE** |
| **8. `src/bots/BotManager.ts`** | Batch 3.0 | Geometry line-of-sight raycasts, randomized lost-sight grace memory window (`0.4s`–`0.6s`), distance-scaled spread, stuck navigation auto-rerouting. | Step 845 (Batch 3.0 Priority 3). | 2 | B | **INCLUDE** |
| **9. `src/ui/GameHUD.tsx`** | Batch 3.0 | Live Tab Scoreboard overlay, auto-dismissing combat onboarding HUD bar, damage vignette flash, and red hitmarker feedback. | Step 845 (Batch 3.0 Priorities 2, 5, 6). | 2 | B | **INCLUDE** |
| **10. `src/App.tsx`** | Batch 3.0 | Default initial state wiring for `targetingEnemy`, `showScoreboard`, and `showOnboarding`. | Step 845 (Batch 3.0 Priorities 5 & 6). | 2 | B | **INCLUDE** |

---

## 4. FILE-BY-FILE PRESERVATION AND INCLUSION RECOMMENDATIONS

### `src/game/PlayerController.ts`
- **Current State:** Staged changes contain Batch 2.3 fixes (D1, D2, D3, D4, D6); unstaged changes contain Batch 3.0 jump/movement mechanics and Batch 3.0R wheel switch debounce.
- **Recommendation:** **INCLUDE BOTH.** When Git staging is separately authorized on the dedicated branch, execute `git add src/game/PlayerController.ts`. This safely stages the unstaged hunks without reverting or corrupting the staged hunks, unifying all authorized changes into a single cohesive file in the index.

### `src/game/types.ts`
- **Current State:** Unstaged modifications containing tuned weapon parameters and HUD state fields.
- **Recommendation:** **INCLUDE WITHOUT ALTERATION.** User approval in Batch 3.0R-G has formally ratified these exact values. Stage explicitly via `git add src/game/types.ts`.

### `README.md`
- **Current State:** Unstaged modifications replacing the generic template with 188 lines of comprehensive project documentation.
- **Recommendation:** **INCLUDE AS WRITTEN.** Originated from direct user request Step 1362. Stage explicitly via `git add README.md`.

### `src/game/WeaponSystem.ts`
- **Current State:** Unstaged modifications for material disposal, slot cycling, and audio triggers.
- **Recommendation:** **INCLUDE.** Stage explicitly via `git add src/game/WeaponSystem.ts`.

### `src/ui/MainMenu.tsx`
- **Current State:** Unstaged modifications for weapon showcase cards and control legend.
- **Recommendation:** **INCLUDE.** Stage explicitly via `git add src/ui/MainMenu.tsx`.

### `src/game/EngineManager.ts`, `src/game/AudioEngine.ts`, `src/bots/BotManager.ts`, `src/ui/GameHUD.tsx`, `src/App.tsx`
- **Current State:** Unstaged modifications implementing Batch 3.0 core playability and UX features.
- **Recommendation:** **INCLUDE ALL.** Stage each explicitly by full relative path.

---

## 5. MANDATORY EXCLUSION REGISTER

| Target | Nature | Current State | Required Treatment | Future Handling Command (Proposed Only) |
|---|---|---|---|---|
| `strike-force.zip` | 521 KB initial project backup (11/15/2026) | Staged in Git index (`new file: strike-force.zip`) | Preserve locally; exclude from source milestone commit. Do not delete, rename, or move. | `git restore --staged strike-force.zip` |

---

## 6. AUDIT-REPORT PRESERVATION REGISTER

The following engineering and audit reports exist in the workspace and must remain **EXCLUDED** from the source milestone commit:
- `batch-3.0R-implementation-report.md`
- `batch-3.0R-F-forensic-reconciliation-report.md`
- `batch-3.0R-F2-authorization-scope-closure-report.md`
- `batch-3.0R-G-commit-preparation-report.md` (this document)

### Preservation Policy:
- Keep all reports locally in `L:\Strike Force\` as untracked files.
- Never add reports using `git add *.md`.
- If documentation persistence in Git is desired in the future, it must be performed as a separate, dedicated documentation commit on a documentation branch, never mixed into the core gameplay source milestone.

---

## 7. UNRELATED-WORK PROTECTION STRATEGY

To prevent accidental staging, overwriting, or deletion of unrelated local modifications or untracked assets:
1. **No Wildcard Staging:** `git add -A`, `git add .`, and `git add -u` are **STRICTLY FORBIDDEN**.
2. **Explicit Whitelisting:** Only the 10 approved source/documentation files may be staged by exact file path.
3. **No Destructive Cleaning:** `git clean` (with any flags) is **STRICTLY FORBIDDEN**.
4. **No Destructive Resetting:** `git reset --hard` and `git checkout -- .` are **STRICTLY FORBIDDEN**.
5. **No Blind Stash Popping:** Stash operations that could silently overwrite working files are prohibited.

---

## 8. HISTORICAL VERSUS CURRENT-STATE DISTINCTION

Because all Git inspection commands (including `git status`, `git diff`, and `git branch`) were strictly prohibited during Batch 3.0R-G, a strict epistemological distinction must be maintained:

- **Historical Snapshot (Verified prior to Batch 3.0R-G):**
  - Active branch: `main`
  - HEAD: `71ea3755579eeeb7479e58b5c30ef6c4d7c60784` (1 commit ahead of `origin/main`)
  - Index: `src/game/PlayerController.ts` (partially staged), `strike-force.zip` (staged new file)
  - Working Tree: 10 modified files, 3 untracked audit reports
- **Current Repository State (During Batch 3.0R-G):**
  - **UNVERIFIED VIA GIT IN THIS STAGE.**
  - No Git binary was invoked.
  - Filesystem reads confirm all 10 source files, `strike-force.zip`, and audit reports remain present and unaltered on disk.
  - A mandatory pre-flight Git inspection must be the very first action executed when Git commands are authorized in the subsequent stage.

---

## 9. DEDICATED-BRANCH CREATION STRATEGY

### Architectural Objective:
Isolate the cumulative milestone commit onto a dedicated development branch (`feat/batch-3.0-gameplay-overhaul`) so that `main` remains cleanly preserved at commit `71ea375` until an explicit, reviewed merge is authorized.

### Mechanics of Safe Branch Creation:
In Git, executing `git checkout -b <branch-name>` or `git switch -c <branch-name>` when uncommitted changes exist:
1. Creates the new branch reference pointing to current HEAD (`71ea375`).
2. Moves `HEAD` and `HEAD` ref to point to the new branch.
3. Leaves the working tree and the Git index (staging area) **100% UNCHANGED**.
4. Does **NOT** alter, mutate, or touch any staged or unstaged hunks.
5. `main` remains intact and pointing to `71ea375`.

Therefore, branching *before* staging adjustments is completely non-destructive and carries the existing staged/unstaged state directly onto the dedicated branch.

---

## 10. SAFE PARTIAL-STAGING RECONCILIATION STRATEGY

### Challenge:
`PlayerController.ts` currently has staged hunks (Batch 2.3 fixes) and unstaged hunks (Batch 3.0 / 3.0R features).

### Reconciliation Mechanism:
In Git's object model:
- The index contains the tree entry representing `PlayerController.ts` as staged in Batch 2.3.
- The working tree file contains all modifications (Batch 2.3 + Batch 3.0 + Batch 3.0R).
- Running `git add src/game/PlayerController.ts` reads the complete current working tree file and updates the index to that full content.
- This incorporates the unstaged hunks into the index **WITHOUT** discarding or altering the previously staged Batch 2.3 hunks. Both sets of improvements are safely merged into the staged state.

---

## 11. PROPOSED FUTURE COMMAND SEQUENCE (CLEARLY MARKED: NOT EXECUTED)

> [!IMPORTANT]
> **ALL COMMANDS BELOW ARE PROPOSED ONLY. ZERO COMMANDS WERE EXECUTED IN THIS STAGE.**
> These commands represent the exact, safe sequence to be reviewed for the subsequent separately authorized stage.

### Phase 1: Pre-Flight State Verification (Read-Only)
```bash
# PROPOSED — NOT EXECUTED
# 1. Verify current branch and upstream tracking
git status

# 2. Verify current HEAD commit
git log -1 --oneline

# 3. Confirm exact staged contents (should show PlayerController.ts and strike-force.zip)
git diff --cached --name-status

# 4. Confirm exact unstaged contents (should show 10 modified files)
git diff --name-status
```

### Phase 2: Dedicated Branch Creation
```bash
# PROPOSED — NOT EXECUTED
# Create and switch to dedicated development branch without modifying working tree or index
git switch -c feat/batch-3.0-gameplay-overhaul
```

### Phase 3: Staging Reconciliation & Exclusion Handling
```bash
# PROPOSED — NOT EXECUTED
# 1. Unstage the binary archive backup (leaves file untouched on disk)
git restore --staged strike-force.zip

# 2. Stage the 10 approved milestone files explicitly by path
git add src/game/PlayerController.ts
git add src/game/WeaponSystem.ts
git add src/ui/MainMenu.tsx
git add README.md
git add src/game/EngineManager.ts
git add src/game/types.ts
git add src/game/AudioEngine.ts
git add src/bots/BotManager.ts
git add src/ui/GameHUD.tsx
git add src/App.tsx
```

### Phase 4: Staged Content Audit & Compilation Verification
```bash
# PROPOSED — NOT EXECUTED
# 1. Verify that EXACTLY the 10 approved files are staged, and strike-force.zip / reports are NOT staged
git diff --cached --name-status

# 2. Run TypeScript typecheck to verify zero compile errors
npx tsc --noEmit

# 3. Run production build
npm run build
```

### Phase 5: Milestone Commit Execution
```bash
# PROPOSED — NOT EXECUTED
# Execute the milestone commit on the dedicated development branch
git commit -m "feat(gameplay): playability overhaul, combat feedback, and presentation polish (Batches 2.3, 3.0, 3.0R)"
```

### Phase 6: Post-Commit Verification
```bash
# PROPOSED — NOT EXECUTED
# 1. Verify new commit on dedicated branch
git log -1 --stat

# 2. Verify main branch was NOT modified
git branch -v

# 3. Confirm strike-force.zip and reports remain untracked and intact on disk
git status
```

---

## 12. PRE-COMMIT VERIFICATION CHECKLIST

Before any commit is finalized in the future stage, each item on this checklist must pass:

- [ ] Current branch is confirmed to be `feat/batch-3.0-gameplay-overhaul` (NOT `main`).
- [ ] Exactly 10 files are staged in the Git index.
- [ ] `strike-force.zip` is confirmed NOT staged (`git status` shows it as untracked).
- [ ] `strike-force.zip` is confirmed present on disk (size: ~521 KB).
- [ ] Audit reports (`batch-*.md`) are confirmed NOT staged.
- [ ] Staged diff of `PlayerController.ts` contains both Batch 2.3 and Batch 3.0/3.0R changes.
- [ ] Staged diff of `types.ts` contains only the approved weapon parameters and HUD state fields.
- [ ] Staged diff of `README.md` contains only the approved project documentation.
- [ ] `npx tsc --noEmit` exits with code 0 (zero errors).
- [ ] `npm run build` exits with code 0 (production bundle succeeds).
- [ ] ZERO Git push, merge, rebase, or deployment operations are executed.

---

## 13. OPENCODE INDEPENDENT AUDIT FINDINGS

**Auditor:** OpenCode 1.19.0 / Nemotron Independent Reviewer  
**Audit Mode:** Read-Only Verification of Preparation Strategy  

### 1. Incorporation of User Decisions
- **Weapon Balance:** Verified. The proposal preserves the existing weapon-stat definitions in `src/game/types.ts` without alteration, respecting user approval.
- **`strike-force.zip` Exclusion:** Verified. The strategy explicitly unstages `strike-force.zip` via `git restore --staged` and forbids its inclusion in the milestone commit.
- **Dedicated Branch Destination:** Verified. The plan mandates switching to `feat/batch-3.0-gameplay-overhaul` before any commit is created, preventing direct commits to `main`.

### 2. Challenge of Staging & Branching Strategy
- **Partial-Staging Integrity:** OpenCode independently confirmed that creating a new branch via `git switch -c` preserves existing index states, and subsequent execution of `git add src/game/PlayerController.ts` safely incorporates unstaged hunks without regressing previously staged Batch 2.3 fixes.
- **Archive Safety:** OpenCode verified that `git restore --staged strike-force.zip` removes the index entry while leaving the disk file completely intact.

### 3. Historical vs. Current State Compliance
- OpenCode confirms that no Git commands were run during this turn, and the report correctly characterizes current Git status as unverified pending the Phase 1 pre-flight check.

### 4. OpenCode Verdict
**OPENCODE VERDICT: A — READY FOR SEPARATELY AUTHORIZED GIT PREPARATION (WITH MANDATORY PRE-FLIGHT VERIFICATION)**

---

## 14. OUTSTANDING RISKS AND UNRESOLVED QUESTIONS

1. **Working Tree Drift Risk:** If any external process modified files in `L:\Strike Force` between Batch 3.0R-F and Batch 3.0R-G, the Phase 1 pre-flight check will immediately detect it.
2. **Lock Files / Lingering Processes:** Ensure local dev servers (`npm run dev`) or node processes do not lock files during staging.
3. **Branch Naming Preference:** The proposed branch name is `feat/batch-3.0-gameplay-overhaul`. The user may specify an alternative branch name if desired.

---

## 15. FINAL READINESS VERDICT

### **VERDICT: A — READY FOR SEPARATELY AUTHORIZED GIT PREPARATION**

**Justification:**
- All three user decisions are fully integrated into an authoritative, reviewable execution plan.
- The 10-file milestone scope is completely reconciled with direct Level 1 and Level 2 authorization evidence.
- The mandatory exclusion of `strike-force.zip` and audit reports is strictly enforced.
- The dedicated-branch strategy guarantees that `main` is protected against accidental direct commits.
- Zero Git mutations and zero Git commands were executed during this stage.

*(Note: Verdict A confirms preparation readiness only; it does not authorize the execution of Git commands or commits.)*
