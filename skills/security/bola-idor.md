# BOLA / IDOR — Broken Object Level Authorization (Web)

Tests REST/GraphQL APIs for Broken Object Level Authorization (BOLA/IDOR) — the #1 OWASP API risk. Ensures every object-fetch/mutation verifies the requesting user owns (or is authorized for) the resource.

> **BẮT BUỘC:** Áp dụng cho mọi endpoint truy cập object theo ID: `GET/PUT/DELETE /:id`, list-by-user, nested resources, bất kỳ route nào nhận resource ID từ client.

## When to Use

- Any route that fetches/updates/deletes a resource by id
- List endpoints returning user-specific data
- Nested/related resource access
- Reviewing authorization logic for object-level checks

## Core Rule

**Authentication ≠ Authorization.** Being logged in (valid token) does NOT authorize access to *any* object. Every object reference must be checked against the requester.

## Correct Pattern

```js
// ❌ WRONG — only checks "logged in", then fetches ANY order
app.get('/api/orders/:id', authRequired, async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404);
  return res.json(order);   // IDOR! any user can read any order
});

// ✅ CORRECT — verifies ownership
app.get('/api/orders/:id', authRequired, async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404);
  if (order.userId !== req.user.id) return res.status(403);  // ownership check
  return res.json(order);
});
```

## Checklist (review gate)

- [ ] Every `:id` endpoint verifies ownership/authorization (`userId === req.user.id` or role-permitted)
- [ ] No mass-assignment: `Object.assign(req.body)` / blind spread into DB model
- [ ] UUIDs/counting tricks don't bypass: even with unguessable IDs, still enforce the check
- [ ] Bulk/list endpoints don't leak other users' objects
- [ ] Nested resources check parent ownership too (`/users/:uid/orders/:id`)

## Test Approach

- Attempt to access another user's object id with your own token → expect 403
- Test list endpoints return only own records
- Test nested refs and id enumeration

## Output

Findings with severity. **Any missing ownership check on object-id endpoint = FAIL, blocks PASS.** Resolve before commit.

## Tone

Be specific — "GET /api/orders/:id returns any user's order (no ownership check) at server/routes/orders.ts:12" not "IDOR issue".
