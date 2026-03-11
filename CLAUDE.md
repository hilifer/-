# CLAUDE.md

## Project Overview

This is a **Traditional Chinese & Western Medicine Clinic Web Platform** — a comprehensive outpatient consultation system that integrates AI-powered diagnostic assistance with traditional and modern medical practices.

### Core Vision

- **Patient portal**: Registration, appointment booking, medical records, and image uploads (facial features, palm lines, tongue coating, ears, etc.)
- **Doctor portal**: Registration, patient review, AI-assisted diagnosis, and prescription management
- **Admin system**: User management, system configuration, and analytics
- **AI diagnostics module**: Deep learning models that analyze patient images (face, palms, tongue, ears) to assist TCM diagnosis
- **Data libraries**: Herbal medicine database, prescription library, and AI training dataset

## Repository Status

This project is in the **early planning / greenfield stage**. No code has been written yet — only the project description exists in `README.md`.

## Recommended Technology Stack

*(To be finalized — these are suggestions based on the project requirements)*

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React / Next.js + TypeScript | Rich UI for patient/doctor portals |
| Backend API | Python (FastAPI or Django REST) | Strong AI/ML ecosystem |
| Database | PostgreSQL | Relational data, JSONB for flexible schemas |
| AI/ML | PyTorch / TensorFlow | Image classification and analysis models |
| Object Storage | MinIO / S3 | Patient image storage |
| Auth | JWT + Role-based access control | Patient / Doctor / Admin roles |
| Deployment | Docker + Docker Compose | Reproducible environments |

## Project Structure (Planned)

```
/
├── CLAUDE.md              # This file — AI assistant guide
├── README.md              # Project description (Chinese)
├── frontend/              # Web frontend (React/Next.js)
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route-level pages
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API client functions
│   │   └── types/         # TypeScript type definitions
│   └── package.json
├── backend/               # API server (Python)
│   ├── app/
│   │   ├── api/           # Route handlers / endpoints
│   │   ├── models/        # Database models (ORM)
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic
│   │   └── core/          # Config, security, database setup
│   ├── migrations/        # Database migrations
│   ├── tests/             # Backend tests
│   └── requirements.txt
├── ai/                    # AI/ML module
│   ├── models/            # Model architectures
│   ├── training/          # Training scripts and configs
│   ├── inference/         # Inference service / API
│   └── data/              # Dataset management utilities
├── database/              # SQL schemas, seed data
├── docker-compose.yml     # Multi-service orchestration
└── docs/                  # Additional documentation
```

## Development Conventions

### Language & Localization

- **Code**: All code, comments, variable names, and commit messages in **English**
- **User-facing content**: Support **Chinese (Simplified)** as the primary UI language
- README and project descriptions may remain in Chinese

### Code Style

- **Python**: Follow PEP 8; use type hints; format with `black` and lint with `ruff`
- **TypeScript/JavaScript**: Use ESLint + Prettier; prefer functional components and hooks
- **SQL**: Use lowercase keywords; snake_case for table and column names

### Git Workflow

- Write clear, descriptive commit messages in English
- Use conventional commits format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep commits focused — one logical change per commit

### Security Requirements (Critical)

This is a **medical application** handling sensitive patient data:

- Never store plaintext passwords — always use bcrypt or argon2
- All patient images and medical records must be access-controlled
- Implement proper RBAC: patients see only their own data, doctors see assigned patients
- Sanitize all user inputs — prevent SQL injection, XSS, and file upload attacks
- Use HTTPS in production; sign and validate all JWTs
- Comply with relevant medical data protection regulations
- Never commit secrets, API keys, or credentials to the repository

### AI/ML Guidelines

- Store trained model weights outside the git repo (use Git LFS or external storage)
- Document model architectures, training hyperparameters, and dataset versions
- Include evaluation metrics and benchmark results with each model version
- Patient images used for training must be anonymized and consent-verified

### Testing

- Backend: Use `pytest` with fixtures; aim for coverage on all API endpoints
- Frontend: Use Jest + React Testing Library for component tests
- AI: Include unit tests for data preprocessing and inference pipelines

## Common Commands

*(To be populated as the project scaffolding is built)*

```bash
# Backend
# pip install -r backend/requirements.txt
# cd backend && uvicorn app.main:app --reload

# Frontend
# cd frontend && npm install && npm run dev

# Database
# docker-compose up -d db
# cd backend && alembic upgrade head

# Tests
# cd backend && pytest
# cd frontend && npm test

# Linting
# cd backend && ruff check . && black --check .
# cd frontend && npm run lint
```

## Key Domain Concepts

| Term (EN) | Term (ZH) | Description |
|---|---|---|
| TCM | 中医 | Traditional Chinese Medicine |
| Prescription | 处方 | Herbal medicine formula |
| Herbal Database | 药材库 | Catalog of medicinal herbs and materials |
| Tongue Diagnosis | 舌诊 | TCM diagnostic method analyzing tongue coating and color |
| Palm Reading | 手诊 | Diagnostic analysis of palm lines and texture |
| Face Diagnosis | 面诊 | Facial feature analysis for health indicators |
| Ear Diagnosis | 耳诊 | Ear morphology analysis for health assessment |

## Notes for AI Assistants

- This is a medical platform — prioritize **correctness and safety** over speed
- Always validate that AI diagnostic features are positioned as **assistive tools**, not replacements for physician judgment
- When generating database schemas, consider HIPAA-style data protection principles
- Patient-uploaded images are sensitive — treat them with the same care as medical records
- When uncertain about medical domain specifics, flag them for human review rather than guessing
