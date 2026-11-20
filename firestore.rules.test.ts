/**
 * Phase 0 Payload-First Security TDD Test Suite for CampusFin Firestore Rules
 * Validates the "Dirty Dozen" adversarial payloads against security_spec.md.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const dirtyDozenTestCases: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Order',
    collection: 'orders/ord_spoof_1',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@dgu.ac.in', email_verified: true },
    payload: { userId: 'victim_uid', status: 'Scheduled', paymentStatus: 'Pending', priceInr: 150 },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Privilege Escalation on Signup',
    collection: 'users/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@dgu.ac.in', email_verified: true },
    payload: { uid: 'attacker_uid', role: 'admin', email: 'attacker@dgu.ac.in' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Unverified Email Write',
    collection: 'orders/ord_unverified_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: false },
    payload: { userId: 'user_1', status: 'Scheduled', paymentStatus: 'Pending', priceInr: 150 },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Status Shortcutting on Create',
    collection: 'orders/ord_shortcut_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', status: 'Delivered', paymentStatus: 'Verified', priceInr: 150 },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Terminal State Tampering on Delivered Order',
    collection: 'orders/ord_delivered_1',
    operation: 'update',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { status: 'Cancelled' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Shadow / Ghost Field Injection on Review',
    collection: 'reviews/rev_shadow_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', rating: 5, verifiedAccount: true, isFeatured: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Fake Verified Order Review',
    collection: 'reviews/rev_fake_order_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', verifiedAccount: true, verifiedOrder: true, orderId: 'nonexistent_order' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'PII Blanket Read on Another User Profile',
    collection: 'users/victim_uid',
    operation: 'get',
    auth: { uid: 'attacker_uid', email: 'attacker@dgu.ac.in', email_verified: true },
    payload: {},
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'ID Poisoning with Oversized Document ID',
    collection: `orders/${'a'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', status: 'Scheduled' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Timestamp Backdating on Expense',
    collection: 'expenses/exp_backdate_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', amountInr: 150, createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Unit Economics Price Tampering',
    collection: 'orders/ord_price_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@dgu.ac.in', email_verified: true },
    payload: { userId: 'user_1', priceInr: -500, variableCostInr: 99999 },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Helpful Count Inflation on Review',
    collection: 'reviews/rev_helpful_1',
    operation: 'update',
    auth: { uid: 'user_2', email: 'peer@dgu.ac.in', email_verified: true },
    payload: { helpfulCount: 500 },
    expectedResult: 'PERMISSION_DENIED'
  }
];
