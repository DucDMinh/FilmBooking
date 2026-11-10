# React + Node.js — Implementation Patterns

> Example patterns for React + Node projects only. Đọc `.agent/PROJECT_PROFILE.md` trước.
> DB examples only apply when `db_tool` matches; if `db_tool: none`, skip all database patterns.

## API Pattern

### Route Definition
```typescript
// server/routes/user-routes.ts
import { Router } from 'express';
import { authenticate } from '@/server/middleware/auth';
import { validate } from '@/server/middleware/validate';
import { createUserSchema, updateUserSchema } from '@/shared/validators/user';
import * as userController from '@/server/controllers/user-controller';

const router = Router();

router.get('/', authenticate, userController.getAll);
router.get('/:id', authenticate, userController.getById);
router.post('/', authenticate, validate(createUserSchema), userController.create);
router.put('/:id', authenticate, validate(updateUserSchema), userController.update);
router.delete('/:id', authenticate, userController.remove);

export { router as userRoutes };
```

### Controller Pattern
```typescript
// server/controllers/user-controller.ts
import { Request, Response, NextFunction } from 'express';
import * as userService from '@/server/services/user-service';

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userService.findAll(req.query);
    res.json({ data: users });
  } catch (error) {
    next(error);
  }
};
```

### Service Pattern (Prisma example — only when `PROJECT_PROFILE.db_tool = prisma`)
If `db_tool` is not `prisma`, adapt this layer to the configured data tool. If `db_tool: none`, skip DB access.

```typescript
// server/services/user-service.ts
import { prisma } from '@/server/utils/db';
import type { CreateUserInput } from '@/shared/validators/user';

export const findAll = async (filters: Record<string, unknown>) => {
  return prisma.user.findMany({
    where: buildWhereClause(filters),
    select: { id: true, email: true, name: true, createdAt: true },
  });
};

export const create = async (data: CreateUserInput) => {
  return prisma.user.create({ data });
};
```

---

## Auth Pattern (JWT)

### Token Utils
```typescript
// server/utils/jwt.ts
import * as jose from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export const signToken = async (payload: { userId: string; role: string }) => {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
};

export const verifyToken = async (token: string) => {
  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
};
```

### Auth Middleware
```typescript
// server/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/server/utils/jwt';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = header.slice(7);
    const payload = await verifyToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## Prisma pattern — only when `PROJECT_PROFILE.db_tool = prisma`

Do not require `prisma/schema.prisma`, `@prisma/client`, or `export const prisma` when `db_tool`
is `none`, `drizzle`, or `other`. If `db_tool: none`, skip this entire database pattern.

### Schema
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  USER
  ADMIN
}
```

### DB Client Singleton
```typescript
// server/utils/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

---

## Frontend Data Fetching (TanStack Query)

```typescript
// client/services/user-service.ts
import ky from 'ky';
import type { User } from '@/shared/types/user';

const api = ky.create({ prefixUrl: '/api' });

export const getUsers = () => api.get('users').json<{ data: User[] }>();
export const getUser = (id: string) => api.get(`users/${id}`).json<{ data: User }>();
export const createUser = (data: CreateUserInput) => api.post('users', { json: data }).json<{ data: User }>();
```

```typescript
// client/hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as userService from '@/client/services/user-service';

export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: userService.getUsers,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userService.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};
```

---

## Error Handling Pattern

### Global Error Handler
```typescript
// server/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '@/server/utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path }, 'Request error');

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: err.errors });
  }

  if (err.name === 'NotFoundError') {
    return res.status(404).json({ error: err.message });
  }

  return res.status(500).json({ error: 'Internal server error' });
};
```

---

## Validation Pattern (Zod — shared)

```typescript
// shared/validators/user.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(100),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

### Validation Middleware
```typescript
// server/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.errors });
    }
    req.body = result.data;
    next();
  };
};
```

---

## React Compiler — Compiler-Aware Coding

Template bật **React Compiler (native Rust)** qua `@vitejs/plugin-react` với `compiler: true` (không cần `@rolldown/plugin-babel` + preset nữa). Compiler tự động memo hóa component/hook → rẻ hơn build, nhanh hơn runtime.

### Viết code "compiler-friendly"

- Không lạm dụng `memo`, `useMemo`, `useCallback` thủ công — compiler tự lo, chỉ dùng tay khi đã đo được bottleneck thật (profiler/console).
- Viết component/hook thuần, không mutate props/state — compiler tối ưu được khi code "đúng luật" React.
- Giữ logic trong component body (compiler phân tích được) thay vì nhét hết vào thư viện bên ngoài.

### 2 pattern khiến compiler bỏ qua (bailout)

- `throw` bên trong `try` block
- Logical assignment: `??=`, `&&=`, `||=`

Nếu gặp 2 pattern này, tách ra biến/function riêng để compiler tiếp tục tối ưu.

### Lint

Thêm `eslint-plugin-react-compiler` để ESLint bắt luôn pattern không được compiler support ngay lúc viết code.
```json
// .eslintrc — plugins
eslint-plugin-react-compiler
```

---

## Testing Patterns

### Shared API Contract Types

Tạo file này TRƯỚC khi viết bất kỳ API endpoint hay test nào:

```typescript
// shared/types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

// Auth contracts
export interface AuthData {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Response helpers (server-side)
export const ok = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json({ success: true, data } satisfies ApiResponse<T>);

export const fail = (res: Response, error: string, status = 400) =>
  res.status(status).json({ success: false, error } satisfies ApiError);
```

---

### Test Pyramid — Phân bổ theo task type

| Task Type | Unit | Integration | Contract |
|-----------|------|-------------|----------|
| Pure function / helper | ✅ Required | — | — |
| Validator / parser | ✅ Required | — | — |
| DB query (service layer) | ✅ mock/in-mem | — | — |
| API endpoint | — | ✅ Required | ✅ Required |
| Auth endpoint (login/register/refresh) | — | ✅ Required | ✅ **Test-first** |
| UI Component | ✅ render | ✅ interaction | — |
| Payment / critical flow | ✅ | ✅ | ✅ **Test-first** |

---

### Contract Test Pattern (API)

```typescript
// tests/auth.contract.test.ts
import request from 'supertest';
import { app } from '../src/app';
import type { ApiResponse, AuthData } from '../shared/types/api';

describe('POST /api/auth/login — contract', () => {
  it('returns shape that client parse() can consume', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);

    // Assert against shared contract, NOT backend implementation detail
    const body = res.body as ApiResponse<AuthData>;
    expect(body.success).toBe(true);
    expect(body.data.token).toEqual(expect.any(String));
    expect(body.data.user.id).toEqual(expect.any(String));
    expect(body.data.user.email).toEqual(expect.any(String));

    // Ensure old format is NOT present (regression guard)
    expect((res.body as Record<string, unknown>).token).toBeUndefined();
  });

  it('returns consistent error shape on invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });
});
```

---

### Integration Test Pattern (API endpoint)

```typescript
// tests/users.integration.test.ts
import request from 'supertest';
import { app } from '../src/app';
import { createTestDb, cleanupTestDb } from './helpers/db';

beforeAll(() => createTestDb());
afterAll(() => cleanupTestDb());

describe('GET /api/users/:id', () => {
  it('returns user in correct shape', async () => {
    const token = await getTestToken(); // helper that calls login → returns token
    const res = await request(app)
      .get('/api/users/test-user-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      name: expect.any(String),
    });

    // Sensitive fields must NOT leak
    expect(res.body.data.password).toBeUndefined();
  });
});
```

---

### Unit Test Pattern (Service / Business Logic)

```typescript
// tests/user-service.test.ts
import { hashPassword, verifyPassword } from '../src/server/utils/password';

describe('password utils', () => {
  it('hashes and verifies correctly', async () => {
    const plain = 'MyPassword123!';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

---

### Test-First Checklist (auth & payment tasks)

Before writing any auth/payment endpoint code:
- [ ] Define request/response types in `shared/types/api.ts`
- [ ] Write contract test first (it will fail — that's expected)
- [ ] Implement endpoint using `ok()`/`fail()` helpers
- [ ] Contract test must pass before moving on
- [ ] Add regression guard: assert old format fields are `undefined`
