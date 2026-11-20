# CampusFin Security Specification (Phase 0)

## 1. Data Invariants

1. **Identity Integrity**: Every document in `users`, `orders`, `reviews`, `deadlines`, and `expenses` must bind its ownership field (`uid` or `userId`) to `request.auth.uid` on creation and preserve it immutably on updates.
2. **Email Verification Enforcement**: All authenticated writes require `request.auth.token.email_verified == true`.
3. **Role Protection**: Regular users creating `users/{userId}` can only set `role: "student"` and cannot elevate themselves to `"admin"`. Admin operations check `isAdmin()` via verified founder email (`abbas.0251mba260@dgu.ac.in`) or `/admins/{request.auth.uid}`.
4. **PII Isolation**: User emails, room numbers, phones, and UPI references in `users` and `orders` are strictly restricted to the owning user or an admin. Public `reviews` contain zero PII.
5. **Order Lifecycle & Terminal Locking**: Orders start in `status: "Scheduled"` and `paymentStatus: "Pending"`. Students can only cancel a `"Scheduled"` order or attach a UPI reference while `"Scheduled"`. Once an order reaches `"Delivered"` or `"Cancelled"`, non-admin mutations are blocked.
6. **Verified Review Integrity**: Reviews must set `verifiedAccount: true` (enforced against `email_verified == true`), `helpfulCount: 0` on create, and if `orderId` is non-empty, `verifiedOrder: true` is only permitted if `/orders/{orderId}` exists, belongs to `request.auth.uid`, and has `status == "Delivered"`.
7. **Temporal & Volumetric Integrity**: All `createdAt` and `updatedAt` fields must match `request.time`; `createdAt` is immutable. All IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars) and all strings/numbers enforce strict type and range bounds.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Order**: Create `/orders/ord_1` with `userId: "victim_uid"` while authenticated as `"attacker_uid"`. -> Expected: `PERMISSION_DENIED`.
2. **Privilege Escalation on Signup**: Create `/users/attacker_uid` with `role: "admin"`. -> Expected: `PERMISSION_DENIED`.
3. **Unverified Email Write**: Attempt any create/update with `request.auth.token.email_verified == false`. -> Expected: `PERMISSION_DENIED`.
4. **Status Shortcutting**: Student attempts to create `/orders/ord_2` directly with `status: "Delivered"` and `paymentStatus: "Verified"`. -> Expected: `PERMISSION_DENIED`.
5. **Terminal State Tampering**: Student attempts to modify an order whose `status` is already `"Delivered"`. -> Expected: `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: Create `/reviews/rev_1` with an extra undocumented field `isFeatured: true`. -> Expected: `PERMISSION_DENIED`.
7. **Fake Verified Order Review**: Create `/reviews/rev_2` with `verifiedOrder: true` and `orderId: "nonexistent"` or another user's order ID. -> Expected: `PERMISSION_DENIED`.
8. **PII Blanket Read**: Non-admin user attempts `get` or `list` on `/users` or `/orders` belonging to another user. -> Expected: `PERMISSION_DENIED`.
9. **ID Poisoning**: Attempt `create` at `/orders/` with a 200-char or invalid-character document ID. -> Expected: `PERMISSION_DENIED`.
10. **Timestamp Backdating**: Attempt `create` on `/expenses/exp_1` with a client-forged `createdAt` not equal to `request.time`. -> Expected: `PERMISSION_DENIED`.
11. **Price / Unit Economics Tampering**: Attempt `create` on `/orders/ord_3` with `priceInr: -500` or `variableCostInr: 999999`. -> Expected: `PERMISSION_DENIED`.
12. **Helpful Count Inflation**: User updates a review's `helpfulCount` from `0` to `500` in a single write. -> Expected: `PERMISSION_DENIED`.
