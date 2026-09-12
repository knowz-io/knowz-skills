# KnowzCode Visual Guide

*Your visual roadmap to understanding the KnowzCode ecosystem.*

This guide illustrates the file structure and workflow of a KnowzCode project, showing how all components work together to create a systematic development environment.

Navigate with confidence through every file, folder, and workflow in a KnowzCode project.

---

### How KnowzCode Components Work Together

```mermaid
graph TD
    subgraph "Your Input"
        User[You: Provide Goals & Decisions]
        EnvContext[knowzcode/environment_context.md<br/>You Configure This]
    end

    subgraph "Core System Files"
        Project[knowzcode/knowzcode_project.md<br/>Vision & Standards]
        Architecture[knowzcode/knowzcode_architecture.md<br/>System Blueprint]
        Loop[knowzcode/knowzcode_loop.md<br/>AI Instructions]
        Journal[knowzcode/journal/<br/>Immutable Work Shards]
    end

    subgraph "Generated During Development"
        Specs[knowzcode/specs/*.md<br/>Component Blueprints]
        Planning[knowzcode/planning/*.md<br/>Feature Analysis]
        Code[Your Code<br/>The Actual App]
    end

    subgraph "Workflow Tools"
        Prompts[knowzcode/prompts/<br/>Spec_Verification_Checkpoint.md<br/>[LOOP_2B]__Verify_Implementation.md]
    end

    %% User interactions
    User -->|Provides PrimaryGoal| Loop
    User -->|Fills out| EnvContext
    User -->|Uses| Prompts

    %% How Loop uses other files
    Loop -->|Reads context from| Project
    Loop -->|Writes one shard per event to| Journal
    Loop -->|Follows map in| Architecture
    Loop -->|Uses commands from| EnvContext

    %% What gets created
    Loop -->|Creates/Updates| Specs
    Loop -->|Writes| Code
    Prompts -->|Generates| Planning

    %% Dependencies
    Architecture -->|Defines all| Specs
    Journal -->|Derives in-flight status of| Specs
    Specs -->|Blueprint for| Code

    style User fill:#4CAF50,color:#fff
    style EnvContext fill:#4CAF50,color:#fff
    style Code fill:#FF5252,color:#fff
    style Loop fill:#FF9800,color:#fff
    style Project fill:#2196F3,color:#fff
    style Architecture fill:#2196F3,color:#fff
    style Journal fill:#2196F3,color:#fff
    style Specs fill:#9C27B0,color:#fff
    style Planning fill:#9C27B0,color:#fff
    style Prompts fill:#607D8B,color:#fff
```

---

### At a Glance

KnowzCode organizes AI-assisted development into a systematic, maintainable process through a carefully orchestrated file system. This guide is your architectural blueprint—showing you exactly what lives where and why it matters.

---

### Core Architecture Overview

| Path | Description |
| :--- | :--- |
| 📁 `knowzcode/` | ← The System's Core Documents |
| ├── `knowzcode_project.md` | The Project's Constitution & Vision |
| ├── `knowzcode_architecture.md` | The Visual System Blueprint |
| ├── `knowzcode_loop.md` | The AI Agent's Operational Manual |
| ├── `journal/` | The Project's Immutable History (one shard per event) |
| ├── `knowzcode_tracker.md` | Frozen archive — pre-journal progress table |
| └── `knowzcode_log.md` | Frozen archive — pre-journal history |
| ├── `environment_context.md` | ← The Agent's Tactical "Driver" |
| ├── `specs/` | ← The Blueprint Library for Components |
| │   └── `[NodeID].md` | Individual Component Contracts |
| ├── `planning/` | ← Strategic & Brainstorming Artifacts |
| ├── `workgroups/` | ← Live WorkGroup todo queues (each entry begins `KnowzCode:`) |
| │   └── `feature_breakdown_...md`| Feature Analysis Reports |
| └── `prompts/` | ← The Orchestrator's Command Toolkit |
|     └── `ND__*.md` | Workflow & Loop Templates |

---

### The Core Documents: `knowzcode/`

The brain of your operation—five essential files that orchestrate strategy.

**`knowzcode/knowzcode_project.md`** - The Project Constitution
*   **Purpose:** Defines the project's DNA: its vision, goals, tech stack, and coding standards.

**`knowzcode/knowzcode_architecture.md`** - The Visual Blueprint
*   **Purpose:** An interactive system flowchart showing all components (`NodeID`s) and their connections.

**`knowzcode/knowzcode_loop.md`** - The AI's Playbook
*   **Purpose:** The AI agent's primary instruction manual, detailing the step-by-step development process.

**`knowzcode/journal/`** - The Project's Memory and Live Dashboard
*   **Purpose:** A complete, chronological history of all significant decisions, actions, and outcomes — and the source of current status.
*   **Layout:** `journal/YYYY-MM/<WorkGroupID>/YYYYMMDDTHHMMSSZ-<type>-<shortid>.md`, one immutable file per event.
*   **Reading it:** Filenames are UTC time-prefixed, so `ls knowzcode/journal/*/*/*.md | sort -r` is the recent history. A WorkGroup folder with no `arc-completion` or `workgroup-abandoned` shard is still in flight.
*   **Writing it:** Agents create shards; they never edit or delete one. Corrections are new shards.
*   **Helper:** `knowzcode/scripts/journal-index.sh` prints in-flight WorkGroups and recent shards.

**`knowzcode/knowzcode_tracker.md`** and **`knowzcode/knowzcode_log.md`** - Frozen Archives
*   **Purpose:** Read-only history from before the journal. Nothing writes to them. New installs get stubs pointing at `journal/`.

---

### The Core Files: `knowzcode/`

**`knowzcode/environment_context.md`** - The Tactical "Driver"
*   **Purpose:** Translates the abstract goals from `knowzcode/knowzcode_loop.md` into concrete, platform-specific commands.
*   **Your Role:** You, the user, must fill this file out to tell the agent *how* to operate in your specific environment (e.g., how to run tests, commit code, etc.). **The system cannot function without it.**

**`knowzcode/specs`** - The Blueprint Library
*   **Purpose:** Contains detailed blueprints (`[NodeID].md`) for every single component in the system. Each spec is a contract that is drafted before building and finalized to an "as-built" state after verification.

**`knowzcode/planning`** - The Strategy Room
*   **Purpose:** A directory to store strategic planning documents generated by `/knowzcode:explore` or direct planning conversations. These artifacts help shape the roadmap before work officially begins.

---

### The KnowzCode Lifecycle

This diagram shows the updated, verification-driven lifecycle.

*(Note: This is a textual representation of the workflow. The visual diagram may not be updated.)*

```mermaid
graph LR
    Start([Start Work Session]) --> Goal{Provide<br/>PrimaryGoal}
    Goal --> L1A[LOOP 1A<br/>Propose Change Set]
    L1A --> Review1{Review<br/>Change Set}
    Review1 -->|Approved| L1B[LOOP 1B<br/>Draft Specs]
    L1B --> Review2{Review<br/>Specs}
    Review2 -->|Approved| Gate1{Spec<br/>Verification<br/>Checkpoint?};
    Gate1 --> |Yes| VerifySpecs[Verify Specs] --> L2A;
    Gate1 --> |No| L2A;
    L1B --> L2A[LOOP 2A<br/>Implement]
    L2A --> L2B[LOOP 2B<br/>Audit]
    L2B --> Review3{Review<br/>Audit}
    Review3 --> |Approved| L3[LOOP 3<br/>Finalize & Commit]
    Review3 --> |Rejected| L2A
    L3 --> Complete([Feature Complete])
    Complete --> Start

    style Start fill:#4CAF50,color:#fff
    style Complete fill:#4CAF50,color:#fff
    style Goal fill:#FF9800,color:#fff
    style Review1 fill:#FF9800,color:#fff
    style Review2 fill:#FF9800,color:#fff
    style Review3 fill:#FF9800,color:#fff
    style Gate1 fill:#E91E63,color:#fff
    style L1A fill:#2196F3,color:#fff
    style L1B fill:#2196F3,color:#fff
    style L2A fill:#2196F3,color:#fff
    style L2B fill:#2196F3,color:#fff
    style L3 fill:#2196F3,color:#fff
```

**Phase 1: Genesis (New Project)**
1.  **Prepare your vision** → Create blueprint, project overview, and architecture
2.  **Build initial prototype** → AI creates the first version
3.  **`/knowzcode:setup`** (or copy `knowzcode/` directory) → Initialize KnowzCode in project

**Phase 2: Development (The Loop)**
1.  **Start with `/knowzcode:work "goal"`** (Claude Code) or the Loop 1A prompt (any platform) → Agent analyzes impact for your goal.
2.  **You approve the proposed Change Set**.
3.  **The Verification-Driven Loop Begins:**
    *   `knowzcode/prompts/[LOOP_1A] Propose Change Set`
    *   `knowzcode/prompts/[LOOP_1B] Draft Specs`
    *   (Optional) `knowzcode/prompts/Spec_Verification_Checkpoint`
    *   `knowzcode/prompts/[LOOP_2A] Implement Change Set`
    *   (Mandatory) `knowzcode/prompts/[LOOP_2B] Verify Implementation`
    *   `knowzcode/prompts/[LOOP_3] Finalize & Commit`
4.  Repeat for the next `PrimaryGoal`.

---

### Quick Navigation Guide

| I want to... | Look at... |
| :--- | :--- |
| Understand the project's vision | `knowzcode/knowzcode_project.md` |
| See the big picture | `knowzcode/knowzcode_architecture.md`|
| Check project progress | `knowzcode/journal/` (or `knowzcode/scripts/journal-index.sh`) |
| Find a component's details | `knowzcode/specs/[NodeID].md` |
| Review project history | `knowzcode/journal/*/*/*.md`, newest filenames first |
| Know how the agent works | `knowzcode/knowzcode_loop.md` |
| See how to run commands | `knowzcode/environment_context.md` |
| Plan future features | `knowzcode/planning/` directory |

---

### File Creation and Ownership

**Human-Created Files:**
- `knowzcode/environment_context.md` - Must be filled out for each development environment

**KnowzCode-Generated Initial Files:**
- All files in `knowzcode/` directory
- Empty `knowzcode/specs/` and `knowzcode/planning/` directories

**Files Generated During Development:**
- `knowzcode/specs/[NodeID].md` - Created as components are designed
- `knowzcode/planning/feature_breakdown_*.md` - Created during planning sessions
- Application source code - Created by AI following the KnowzCode process

---

The KnowzCode system separates strategy (`knowzcode/` files) from tactics (`environment_context.md`), creating a portable, structured framework for AI-driven development.
