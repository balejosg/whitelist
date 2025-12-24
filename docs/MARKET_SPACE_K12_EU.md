# OpenPath — Market Space Assessment (K‑12 EU)

**Date**: 2025-12-23  
**Scope**: K‑12 in the EU (public + private), with an MVP launch goal.

> **Elevator Pitch**: *"OpenPath: Filtrado estricto para menores, con desbloqueo instantáneo para el profesor y cero vigilancia. Control total, privacidad total."*

## 1) What the product is (as implemented / intended)
OpenPath is a strict, **default‑deny** internet access control system where endpoints enforce rules and a central workflow manages changes. The policy source of truth is a **GitHub-hosted allowlist** (“GitOps”) with strong auditability and rollback.

Core workflow:
- Student hits a blocked site → request is created.
- Admin/teacher reviews in dashboard → approval triggers an update to the whitelist.
- Endpoints pull rules and continue enforcing locally.

### Example Use Case
> **María**, profesora de 4º de primaria, necesita que sus alumnos accedan a una simulación de ciencias en una web nueva. Con el sistema actual, envía un email a IT y espera 24-48 horas (la clase ya pasó).  
> **Con OpenPath**: María recibe una notificación push en su móvil, ve que 3 alumnos solicitaron acceso a `science-sim.edu`, pulsa "Aprobar para mi clase", y en **30 segundos** todos sus alumnos pueden acceder. Sin esperas, sin burocracia.

## 2) Market space verdict (K‑12 EU)
There is market space, but only with a specific wedge:
- Competing as a **general K‑12 web filter** puts you in a feature war with incumbents.
- The realistic opportunity is a **privacy/sovereignty + strict control + auditability** position that aligns with EU GDPR concerns for minors.

**High-level conclusion**: viable as an MVP if positioned as a *privacy-first, auditable, strict allowlist + teacher-speed unblock* solution, not as a full surveillance/classroom-management suite.

## 3) Best-fit positioning in the EU
### Primary message (EU K‑12)
- **“Privacy-first filtering for minors”**: minimal data collection, self-hostable / EU-hostable.
- **“Strict allowlist when you need it”**: labs, younger grades, exam-mode classroom sessions.
- **“Teacher-speed unblock”**: approvals that work during class in <60 seconds.

### What *not* to position as
- Not “screen monitoring / student surveillance”.
- Not “AI category filtering” replacement.

## 4) Where you can win (segments inside K‑12 EU)
Focus on early adopter niches within K‑12:
- Schools with strong privacy posture or recent scrutiny about student browsing telemetry.
- Computer labs / 1:1 programs where distractions are a daily pain.
- Schools that value **audit + rollback** for policy changes.

## 5) Top adoption blockers (must address)
### A) Bypass resistance expectations
K‑12 buyers will ask about:
- DoH (DNS-over-HTTPS), VPNs, hotspots/tethering, alternate DNS, browser workarounds.

If the product story is “we block at DNS but bypasses remain easy,” evaluations will often end immediately.

**MVP requirement**: publish and enforce a clear “anti-bypass baseline” (policies + firewall + DNS controls) and be transparent about what is and isn’t covered.

### B) Teacher workflow friction
If unblock requests aren’t:
- fast,
- mobile-friendly,
- reliably scoped to the teacher’s class/groups,

you’ll get pressure to disable the system.

### C) Deployment/operations
K‑12 environments require:
- repeatable installation at scale,
- predictable updates,
- basic endpoint health visibility.

## 6) MVP checklist that can sell (EU K‑12)
Minimum set that enables pilots to convert:
1. **Role-based delegation**: teachers can approve for their assigned groups (without going through central IT for every request).
2. **Mobile-usable teacher view**: a simple queue of class requests and one-tap approve/reject.
3. **Push notifications for teachers**: so approvals happen during class.
4. **Anti-bypass baseline** documented and implementable (DoH/VPN policy guidance, firewall approach, DNS enforcement).
5. **Privacy story**:
   - what data is stored,
   - retention defaults,
   - where data lives (self-host/EU-host),
   - minimal telemetry focus.

## 7) Differentiation vs incumbents (what to emphasize)
- **EU-friendly privacy posture**: minimize data from minors; self-host option.
- **Auditability by design**: Git change trail + rollback.
- **Strict allowlist mode**: fewer “category escapes” than permissive filtering.

## 8) Practical go-to-market (EU reality)
### Pilot-first strategy
- Start with **2–5 pilot schools** or a small network of schools.
- Optimize for proof points: unblock speed, teacher satisfaction, low ops burden.

### Channels
- Consider partnerships with local MSPs / school IT integrators who already deploy endpoint tooling.

## 9) Validation plan (2–3 weeks)
### Interviews (fast learning)
Run 8–12 structured interviews:
- 4× IT coordinators / admins
- 4× teachers
- 2× privacy/compliance stakeholders

### Pilot metrics (define success)
- Median time-to-unblock (target: <60 seconds during class)
- % of requests approved by teachers (target: >70%)
- # bypass incidents reported per week
- Teacher satisfaction / NPS-style question after 2 weeks

## Pricing/Procurement Probe
Test two procurement-ready offers:
- Self-hosted + paid support
- EU-managed service

**Pricing Hypothesis (to validate)**:
| Model | Price Range | Target |
|-------|-------------|--------|
| SaaS (EU-hosted) | €2–4 / device / year | Schools without IT capacity |
| Self-hosted + Support | €500–1500 / year (flat) | Schools with internal IT |
| Free tier | Up to 25 devices | Pilots, small labs |

*Note*: Anchor high in interviews (€4/device), then probe for resistance. Education budgets vary wildly by country.

Ask what is realistic for their buying process (school vs municipality vs region).

## 10) Open questions (to tailor strategy)
- Target country first (procurement and privacy posture vary widely).
- Hosting model: self-host only vs EU-managed hosting.
- Primary environment: labs vs 1:1 devices vs mixed.

### Country Prioritization Matrix
| Country | GDPR Sensitivity | Market Size | Sales Cycle | Language Barrier | Priority |
|---------|------------------|-------------|-------------|------------------|----------|
| 🇳🇱 Netherlands | 🔴 Very High | Medium | Medium | Low (English OK) | **★★★** |
| 🇩🇪 Germany | 🔴 Very High | Large | Slow | Medium | **★★★** |
| 🇪🇸 Spain | 🟡 Medium | Large | Medium | Low (if Spanish support) | **★★☆** |
| 🇫🇷 France | 🟡 Medium | Large | Slow | High | **★☆☆** |
| 🇸🇪 Sweden | 🔴 Very High | Small | Fast | Low | **★★☆** |
| 🇵🇱 Poland | 🟢 Lower | Large | Fast | Medium | **★☆☆** |

**Recommendation**: Start with **Netherlands** or **Germany** (privacy-conscious, English-friendly or high-value). Avoid France initially (language + bureaucracy).

## 11) Strategic Refinements & Risk Mitigation (AI Analysis)
### A) The "Invisible Git" Requirement
While "GitOps" is a strong selling point for IT admins (auditability), it is a **terrifying concept** for non-technical staff.
- **Risk**: If the dashboard exposes merge conflicts or commit hashes to teachers, adoption will fail.
- **Mitigation**: The UI must be a perfect abstraction layer. Git is the *engine*, not the *interface*.

### B) The "Whac-A-Mole" of Bypasses
Blocking DNS is not enough. Students will use DoH, VPNs, and mobile hotspots.
- **Reality Check**: You cannot win the bypass war 100% without invasive agents (which contradicts the privacy pitch).
- **Strategy**: Be honest. Sell "Managed Friction" rather than "Total Blockade". The goal is to make bypassing inconvenient enough that 95% of students don't bother during class.

### C) Sales Cycle Acceleration
Public school procurement in the EU can take 6-18 months.
- **Tactic**: Target **Private/International Schools** first. They have:
  - Shorter decision loops.
  - Higher privacy concerns (often selling to parents based on safety/privacy).
  - More autonomy over their IT stack.

---
**Owner**: (fill in)  
**Next update**: after first 5 interviews / first pilot setup
