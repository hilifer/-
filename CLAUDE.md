# CLAUDE.md

## Project Overview

**杏林智诊** — 中西医结合智慧诊疗平台。单体 Next.js 应用，AI辅助多轮问诊 → 辨证施治 → 处方安全检查 → 医生审核签发。

### Core Business Flow

```
患者登录 → AI预问诊(8轮对话) → AI辨证(证型+置信度+推荐方)
→ 处方安全检查(十八反/十九畏/剂量) → 医生审核(采纳/修改/重写)
→ 电子签发 → 患者查看处方
```

## Technology Stack

| Layer | Technology |
|---|---|
| Full-stack | Next.js 14 (App Router) |
| Styling | Tailwind CSS + custom UI components |
| Database | SQLite (dev) via Prisma 5 ORM |
| Auth | NextAuth.js v4 (Credentials Provider + JWT) |
| Testing | Jest + ts-jest |
| Deployment | Docker / Docker Compose |

## Project Structure

```
clinic/
├── prisma/
│   ├── schema.prisma          # Data models (User, Herb, Consultation, etc.)
│   ├── seed.ts                # 103 herbs + incompatible pairs + demo users
│   └── dev.db                 # SQLite database (gitignored)
├── src/
│   ├── app/
│   │   ├── (auth)/login/      # Login page
│   │   ├── (auth)/register/   # Register page
│   │   ├── patient/
│   │   │   ├── consultation/  # AI multi-round chat + diagnosis view
│   │   │   └── prescriptions/ # Patient prescription list
│   │   ├── doctor/
│   │   │   ├── patients/      # Patient queue for review
│   │   │   └── review/[id]/   # Prescription review + edit + sign
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth + register endpoints
│   │   │   ├── consultation/  # CRUD + message + diagnose
│   │   │   ├── prescription/  # Review + sign
│   │   │   └── herbs/         # Herb search
│   │   ├── layout.tsx         # Root layout (dark theme)
│   │   └── page.tsx           # Landing / role-based redirect
│   ├── components/
│   │   ├── ui/                # Button, Input, Card, Badge
│   │   ├── ai-banner.tsx      # Red "AI辅助意见" warning banner
│   │   ├── navbar.tsx         # Role-aware navigation
│   │   └── providers.tsx      # SessionProvider wrapper
│   ├── lib/
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── ai-consultation.ts # Multi-round Q&A + diagnosis engine
│   │   ├── safety-check.ts    # 十八反/十九畏/剂量 rule checker
│   │   └── __tests__/         # Unit tests (21 tests)
│   └── types/
│       └── next-auth.d.ts     # Session type augmentation
├── Dockerfile
├── docker-compose.yml
├── jest.config.ts
└── package.json
```

## Common Commands

```bash
# One-command setup (generates Prisma client, creates DB, seeds data)
cd clinic && npm install && npm run setup

# Development
npm run dev              # Start dev server on http://localhost:3000

# Database
npm run db:push          # Push schema changes to SQLite
npm run db:seed          # Seed 103 herbs + demo users
npm run db:reset         # Reset DB and re-seed

# Testing
npm test                 # Run all Jest tests (21 tests)

# Docker
docker-compose up --build
```

## Demo Accounts

| Role | Phone | Password |
|---|---|---|
| Patient | 13800000001 | 123456 |
| Doctor | 13800000002 | 123456 |

## Key Design Decisions

- **Single Next.js monolith**: Frontend + API in one project, zero microservice overhead
- **SQLite for dev**: Zero external dependencies, `npm run dev` just works
- **Prisma 5**: Battle-tested ORM, simple `@prisma/client` imports
- **Rule-based safety check**: 十八反/十九畏 are fixed drug pairs, hardcoded (no AI needed)
- **Simulated AI**: Pattern-matching diagnosis engine (swap for real LLM API in production)
- **Dark theme**: `#0a0f0d` background + emerald-400 accent (`#4ade80`)

## UI Conventions

- **Theme**: Dark background `#0a0f0d` + emerald green primary `#4ade80`
- **AI Banner**: Red `bg-red-600` banner on every AI result: "AI辅助意见，仅供参考，最终诊断以医师为准"
- **Adoption buttons**: Adopt All (green) / Partial Modify (yellow) / Full Rewrite (red)
- **Chinese UI**: All user-facing text in Chinese characters directly (no `\uXXXX` escapes)

## Development Conventions

- **Code**: English variable names, comments, commit messages
- **UI text**: Chinese (Simplified)
- **Git**: Conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- **Security**: bcrypt passwords, role-based access, input validation
- **No over-engineering**: No microservices, message queues, K8s, or custom ML training
