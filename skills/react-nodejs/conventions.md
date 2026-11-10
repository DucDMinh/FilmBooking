# React + Node.js — Coding Conventions

## Project Structure

```
src/
├── client/                    # React frontend
│   ├── components/
│   │   ├── ui/               # Reusable UI (Button, Input, Modal)
│   │   ├── layout/           # Layout components (Header, Sidebar)
│   │   └── features/         # Feature-specific components
│   ├── pages/                # Route pages
│   ├── hooks/                # Custom hooks
│   ├── services/             # API calls
│   ├── store/                # State management
│   ├── utils/                # Helper functions
│   ├── types/                # TypeScript types
│   └── App.tsx
│
├── server/                    # Node.js backend
│   ├── routes/               # Express/Fastify routes
│   ├── controllers/          # Request handlers
│   ├── services/             # Business logic
│   ├── models/               # Database models
│   ├── middleware/           # Auth, validation, error handler
│   ├── utils/                # Helper functions
│   ├── types/                # TypeScript types
│   └── index.ts              # Server entry
│
├── shared/                    # Shared between client/server
│   ├── types/                # Shared TypeScript types
│   ├── constants/            # Shared constants
│   └── validators/           # Shared validation schemas
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files (components) | PascalCase | `UserProfile.tsx` |
| Files (others) | camelCase | `authService.ts` |
| Files (routes) | kebab-case | `user-routes.ts` |
| Variables | camelCase | `userName` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Types/Interfaces | PascalCase | `UserProfile` |
| React components | PascalCase | `<UserCard />` |
| Hooks | use + camelCase | `useAuth()` |
| CSS classes | kebab-case | `.user-card` |

## Code Style

- **TypeScript** everywhere (strict mode)
- **Functional components** only (no class components)
- **Arrow functions** for components and handlers
- **Named exports** (no default exports except pages)
- **Absolute imports** with `@/` alias
- **Max file length**: 300 lines (split if longer)
- **Max function length**: 50 lines
- **Prefer early returns** over nested if/else
- **Compiler-friendly**: đừng tự `memo`/`useMemo`/`useCallback` tràn lan — React Compiler (Rust) tự tối ưu. Chỉ dùng tay khi đã đo được bottleneck.

## Formatting

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

## ESLint

- Extend: `eslint:recommended`, `@typescript-eslint/recommended`, `react/recommended`, `eslint-plugin-react-compiler`
- No `any` (use `unknown` + type guards)
- No unused variables
- No console.log (use logger)

## Comments

- **JSDoc** for public functions/components
- **Inline** only for "why", never for "what"
- **TODO** format: `// TODO(task-NN): description`
