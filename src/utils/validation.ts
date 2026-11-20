import type {
  DeadlineType,
  ExpenseCategory,
  OrderStatus,
  PaymentMethod,
  PickupSlot,
  ServiceType,
} from '../types';

export const ADMIN_EMAIL = 'abbas.0251mba260@dgu.ac.in';

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export const BLUEPRINT_LIMITS = {
  idMax: 128,
  displayNameMax: 80,
  emailMax: 120,
  hostelBlockMax: 80,
  roomNumberMax: 24,
  phoneMax: 20,
  programMax: 60,
  upiReferenceMax: 64,
  batchCodeMax: 32,
  assignedPartnerMax: 80,
  linkedDeadlineTitleMax: 120,
  notesMax: 300,
  reviewCommentMin: 10,
  reviewCommentMax: 500,
  deadlineTitleMax: 120,
  courseMax: 60,
  expenseTitleMax: 100,
} as const;

export const PICKUP_SLOTS: PickupSlot[] = [
  'Morning (8-10 AM)',
  'Afternoon (1-3 PM)',
  'Evening (6-8 PM)',
];

export const SERVICE_PACKAGES: {
  type: ServiceType;
  priceInr: number;
  variableCostInr: number;
  commercialBenchmarkInr: number;
  maxKg: number;
  turnaround: string;
  summary: string;
}[] = [
  {
    type: 'Regular Wash & Steam Iron',
    priceInr: 150,
    variableCostInr: 90,
    commercialBenchmarkInr: 280,
    maxKg: 4,
    turnaround: '24 hrs',
    summary: 'Core CampusFin MVP bundle · Everyday hostel wear up to 4 kg',
  },
  {
    type: 'Hostel Linen & Towels',
    priceInr: 200,
    variableCostInr: 90,
    commercialBenchmarkInr: 360,
    maxKg: 6,
    turnaround: '24–36 hrs',
    summary: 'Bedsheets, pillow covers, bath towels & heavy cottons',
  },
  {
    type: 'Formal & Presentation Wear',
    priceInr: 250,
    variableCostInr: 90,
    commercialBenchmarkInr: 450,
    maxKg: 4,
    turnaround: '24 hrs',
    summary: 'MBA presentation shirts, trousers, blazers & crisp steam press',
  },
];

export const HOSTEL_BLOCKS = [
  'DGU Boys Hostel Block A',
  'DGU Boys Hostel Block B',
  'DGU Girls Hostel Block A',
  'DGU Girls Hostel Block B',
  'Manduwala PG Cluster',
  'Premnagar Student Residency',
  'Sudhowala Campus PG',
];

export const DEADLINE_TYPES: DeadlineType[] = [
  'Assignment',
  'Presentation',
  'Group Project',
  'Exam',
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Laundry',
  'Food & Mess',
  'Transport',
  'Hostel & PG',
  'Academic',
  'Subscriptions',
  'Other',
];

export const ORDER_PIPELINE_STEPS: OrderStatus[] = [
  'Scheduled',
  'Picked Up',
  'Washing & Ironing',
  'Out for Delivery',
  'Delivered',
];

export const PAYMENT_METHODS: PaymentMethod[] = ['UPI Prepaid', 'Pay on Pickup'];

export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function isValidDocumentId(id: string): boolean {
  return id.length >= 1 && id.length <= BLUEPRINT_LIMITS.idMax && VALID_ID_REGEX.test(id);
}

export function generateSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'cf';
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}_${rand}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIsoDate(baseIso: string, deltaDays: number): string {
  const parsed = new Date(`${baseIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayIsoDate();
  }
  parsed.setDate(parsed.getDate() + deltaDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeBatchCode(hostelBlock: string, pickupDate: string, pickupSlot: PickupSlot): string {
  const compactDate = pickupDate.replace(/-/g, '').slice(0, 8);
  const slotTag = pickupSlot.startsWith('Morning')
    ? 'AM'
    : pickupSlot.startsWith('Afternoon')
      ? 'PM'
      : 'EV';
  const zoneTag = hostelBlock.toLowerCase().includes('girls')
    ? 'DGU-G'
    : hostelBlock.toLowerCase().includes('boys')
      ? 'DGU-B'
      : 'PG-DDN';
  return `${zoneTag}-${compactDate}-${slotTag}`.slice(0, BLUEPRINT_LIMITS.batchCodeMax);
}

export function assignLocalPartner(hostelBlock: string): string {
  const lower = hostelBlock.toLowerCase();
  if (lower.includes('premnagar')) {
    return 'Premnagar Steam Press Partner';
  }
  if (lower.includes('manduwala') || lower.includes('sudhowala')) {
    return 'Manduwala Campus Dhobi Hub';
  }
  return 'Dehradun Express Wash Partner';
}

export function getPackageSpec(serviceType: ServiceType) {
  return (
    SERVICE_PACKAGES.find((item) => item.type === serviceType) ||
    SERVICE_PACKAGES[0]
  );
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
