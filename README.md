<div align="center">
  <img src="docs/icon-animated.svg" alt="Litmus Logo" width="120">

  <h1>Litmus 🧪</h1>
  <p><em>Output-grading quality gate agent — grades any deliverable 0-100 with a rubric, on-chain</em></p>
  <img src="docs/readme-hero-animated.svg" alt="Litmus" width="100%">

  <br/>

  [![Live Demo](https://img.shields.io/badge/🚀_Live-Demo-06b6d4?style=for-the-badge)](https://mock.croo.network)
  [![Built for CROO Hackathon](https://img.shields.io/badge/DoraHacks-CROO_Hackathon_2026-8b5cf6?style=for-the-badge)](https://dorahacks.io)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
  [![CI](https://github.com/edycutjong/litmus/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/litmus/actions/workflows/ci.yml)

</div>

---

## 📸 See it in Action

<div align="center">
  <img src="docs/see-in-action.png" alt="Litmus Demo" width="100%">
</div>

> **The Quality Gate Workflow.** Deliverable Received → Litmus Applies Grading Rubric → Score (0-100) Calculated → Feedback & On-Chain Grade Delivered.

---

## 💡 The Problem & Solution
In an autonomous agent economy, output quality varies wildly. How do you trust an agent's work without manual human review?
**Litmus** is an AI Quality Gate Agent. It acts as an automated, impartial grader that evaluates deliverables against strict, predefined rubrics. If an agent submits subpar code, writing, or analysis, Litmus rejects it, ensuring only high-quality work passes the gate.

**Key Features:**
- ⚖️ **Objective Grading:** Evaluates work across multiple rubric categories, assigning a deterministic score from 0-100.
- 🚧 **Quality Gatekeeper:** Automatically rejects work that falls below the acceptable threshold.
- ⛓️ **On-Chain Attestation:** Cryptographically signs the grade to ensure the evaluation is immutable and verifiable.

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (TypeScript) |
| **Ecosystem** | Constellation A2A (croo-core) |
| **Testing** | Vitest |

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 20
- npm

### Installation
1. Clone: `git clone https://github.com/edycutjong/litmus.git`
2. Install: `npm install`
3. Run: `npm run dev`

## 🧪 Testing & CI

**4-stage pipeline:** Quality → Security → Build → Deploy Gate

```bash
# ── Code Quality ────────────────────────────
make lint          # ESLint
make typecheck     # TypeScript check
make test          # Run tests
make test-coverage # Coverage report
make ci            # Full quality gate

# ── Security ────────────────────────────────
make security-scan # npm audit + license check
```

| Layer | Tool | Status |
|---|---|---|
| Code Quality | ESLint + TypeScript | ✅ |
| Unit Testing | Vitest | ✅ |
| Security (SAST) | CodeQL | ✅ |
| Security (SCA) | Dependabot + npm audit | ✅ |
| Secret Scanning | TruffleHog | ✅ |

## 📁 Project Structure
```text
dorahacks-croo-litmus/
├── docs/              # README assets (hero, screenshots)
├── src/               # Application source code
├── scripts/           # Build and run scripts
├── __tests__/         # Vitest test suites
├── .github/           # CI workflows
└── README.md          # You are here
```

## 📄 License
[MIT](LICENSE) © 2026 Edy Cu

## 🙏 Acknowledgments
Built for the DoraHacks CROO Hackathon 2026.
