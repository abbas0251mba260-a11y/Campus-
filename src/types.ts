export type PickupSlot =
  | 'Morning (8-10 AM)'
  | 'Afternoon (1-3 PM)'
  | 'Evening (6-8 PM)';

export type ServiceType =
  | 'Regular Wash & Steam Iron'
  | 'Hostel Linen & Towels'
  | 'Formal & Presentation Wear';

export type PaymentMethod = 'UPI Prepaid' | 'Pay on Pickup';

export type PaymentStatus = 'Pending' | 'Verified';

export type OrderStatus =
  | 'Scheduled'
  | 'Picked Up'
  | 'Washing & Ironing'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export type DeadlineType = 'Assignment' | 'Presentation' | 'Group Project' | 'Exam';

export type ExpenseCategory =
  | 'Laundry'
  | 'Food & Mess'
  | 'Transport'
  | 'Hostel & PG'
  | 'Academic'
  | 'Subscriptions'
  | 'Other';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  hostelBlock: string;
  roomNumber: string;
  phone: string;
  program: string;
  monthlyBudget: number;
  role: 'student' | 'admin';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface LaundryOrder {
  id: string;
  userId: string;
  studentName: string;
  hostelBlock: string;
  roomNumber: string;
  pickupDate: string;
  pickupSlot: PickupSlot;
  serviceType: ServiceType;
  estimatedKg: number;
  priceInr: number;
  variableCostInr: number;
  contributionInr: number;
  paymentMethod: PaymentMethod;
  upiReference: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  batchCode: string;
  assignedPartner: string;
  linkedDeadlineTitle: string;
  notes: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface VerifiedReview {
  id: string;
  userId: string;
  authorName: string;
  authorProgram: string;
  hostelBlock: string;
  rating: number;
  punctualityRating: number;
  qualityRating: number;
  valueRating: number;
  comment: string;
  wouldRecommend: boolean;
  verifiedAccount: boolean;
  verifiedOrder: boolean;
  orderId: string;
  helpfulCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AcademicDeadline {
  id: string;
  userId: string;
  title: string;
  course: string;
  type: DeadlineType;
  dueDate: string;
  workloadHours: number;
  laundryLinked: boolean;
  linkedOrderId: string;
  completed: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface StudentExpense {
  id: string;
  userId: string;
  title: string;
  category: ExpenseCategory;
  amountInr: number;
  savedInr: number;
  date: string;
  linkedOrderId: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type ActiveView =
  | 'book'
  | 'orders'
  | 'planner'
  | 'reviews'
  | 'operations';
