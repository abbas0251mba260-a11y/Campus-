import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  CalendarClock,
  Check,
  Copy,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AcademicDeadline,
  LaundryOrder,
  PaymentMethod,
  PickupSlot,
  ServiceType,
  UserProfile,
} from '../types';
import {
  addDaysIsoDate,
  assignLocalPartner,
  BLUEPRINT_LIMITS,
  computeBatchCode,
  formatInr,
  generateSafeId,
  getPackageSpec,
  getTodayIsoDate,
  HOSTEL_BLOCKS,
  PAYMENT_METHODS,
  PICKUP_SLOTS,
  sanitizeText,
  SERVICE_PACKAGES,
} from '../utils/validation';

interface BookPickupViewProps {
  userUid: string | null;
  emailVerified: boolean;
  profile: UserProfile | null;
  deadlines: AcademicDeadline[];
  prefillOrder: Partial<LaundryOrder> | null;
  onClearPrefill: () => void;
  onRequireAuth: (mode: 'login' | 'signup') => void;
  onBookingSuccess: (orderId: string) => void;
}

export const BookPickupView: React.FC<BookPickupViewProps> = ({
  userUid,
  emailVerified,
  profile,
  deadlines,
  prefillOrder,
  onClearPrefill,
  onRequireAuth,
  onBookingSuccess,
}) => {
  const [studentName, setStudentName] = useState(profile?.displayName || '');
  const [hostelBlock, setHostelBlock] = useState(
    profile?.hostelBlock || HOSTEL_BLOCKS[0]
  );
  const [roomNumber, setRoomNumber] = useState(profile?.roomNumber || '204');
  const [pickupDate, setPickupDate] = useState(addDaysIsoDate(getTodayIsoDate(), 1));
  const [pickupSlot, setPickupSlot] = useState<PickupSlot>(PICKUP_SLOTS[0]);
  const [serviceType, setServiceType] = useState<ServiceType>(
    SERVICE_PACKAGES[0].type
  );
  const [estimatedKg, setEstimatedKg] = useState<number>(4);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI Prepaid');
  const [upiReference, setUpiReference] = useState('');
  const [linkedDeadlineId, setLinkedDeadlineId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastOrderSummary, setLastOrderSummary] = useState<string | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  useEffect(() => {
    if (profile) {
      if (!studentName) setStudentName(profile.displayName);
      if (profile.hostelBlock) setHostelBlock(profile.hostelBlock);
      if (profile.roomNumber) setRoomNumber(profile.roomNumber);
    }
  }, [profile]);

  useEffect(() => {
    if (prefillOrder) {
      if (prefillOrder.hostelBlock) setHostelBlock(prefillOrder.hostelBlock);
      if (prefillOrder.roomNumber) setRoomNumber(prefillOrder.roomNumber);
      if (prefillOrder.pickupDate) setPickupDate(prefillOrder.pickupDate);
      if (prefillOrder.pickupSlot) setPickupSlot(prefillOrder.pickupSlot);
      if (prefillOrder.serviceType) setServiceType(prefillOrder.serviceType);
      if (prefillOrder.estimatedKg) setEstimatedKg(prefillOrder.estimatedKg);
      if (prefillOrder.linkedDeadlineTitle) {
        const match = deadlines.find(
          (d) => d.title === prefillOrder.linkedDeadlineTitle
        );
        if (match) setLinkedDeadlineId(match.id);
      }
      onClearPrefill();
    }
  }, [prefillOrder, deadlines, onClearPrefill]);

  const activePackage = useMemo(() => getPackageSpec(serviceType), [serviceType]);
  const batchCode = useMemo(
    () => computeBatchCode(hostelBlock, pickupDate, pickupSlot),
    [hostelBlock, pickupDate, pickupSlot]
  );
  const assignedPartner = useMemo(
    () => assignLocalPartner(hostelBlock),
    [hostelBlock]
  );
  const savedVsCommercial = useMemo(
    () => Math.max(0, activePackage.commercialBenchmarkInr - activePackage.priceInr),
    [activePackage]
  );

  const upcomingUnlinkedDeadlines = useMemo(
    () => deadlines.filter((d) => !d.completed && !d.laundryLinked),
    [deadlines]
  );

  const handleApplySmartDeadline = (deadline: AcademicDeadline) => {
    const suggestedPickup = addDaysIsoDate(deadline.dueDate, -2);
    const today = getTodayIsoDate();
    setPickupDate(suggestedPickup >= today ? suggestedPickup : today);
    setLinkedDeadlineId(deadline.id);
    if (deadline.type === 'Presentation') {
      setServiceType('Formal & Presentation Wear');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLastOrderSummary(null);

    if (!userUid) {
      onRequireAuth('signup');
      return;
    }
    if (!emailVerified) {
      setErrorMsg(
        'Please verify your email address first using the verification banner above, or sign in with Google.'
      );
      return;
    }

    const cleanName = sanitizeText(studentName, BLUEPRINT_LIMITS.displayNameMax);
    const cleanHostel = sanitizeText(hostelBlock, BLUEPRINT_LIMITS.hostelBlockMax);
    const cleanRoom = sanitizeText(roomNumber, BLUEPRINT_LIMITS.roomNumberMax);
    const cleanUpi = sanitizeText(upiReference, BLUEPRINT_LIMITS.upiReferenceMax);
    const cleanNotes = sanitizeText(notes, BLUEPRINT_LIMITS.notesMax);

    if (!cleanName || !cleanHostel || !cleanRoom || pickupDate.length !== 10) {
      setErrorMsg('Please complete your name, hostel/PG block, room number, and pickup date.');
      return;
    }

    const selectedDeadline = deadlines.find((d) => d.id === linkedDeadlineId);
    const linkedTitle = sanitizeText(
      selectedDeadline?.title || '',
      BLUEPRINT_LIMITS.linkedDeadlineTitleMax
    );

    const orderId = generateSafeId('ord');
    const expenseId = generateSafeId('exp');
    const priceInr = activePackage.priceInr;
    const variableCostInr = activePackage.variableCostInr;
    const contributionInr = priceInr - variableCostInr;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);

      // 1. Create Laundry Order
      batch.set(doc(db, 'orders', orderId), {
        userId: userUid,
        studentName: cleanName,
        hostelBlock: cleanHostel,
        roomNumber: cleanRoom,
        pickupDate,
        pickupSlot,
        serviceType,
        estimatedKg: Math.min(15, Math.max(1, Number(estimatedKg) || 4)),
        priceInr,
        variableCostInr,
        contributionInr,
        paymentMethod,
        upiReference: cleanUpi,
        paymentStatus: 'Pending',
        status: 'Scheduled',
        batchCode,
        assignedPartner,
        linkedDeadlineTitle: linkedTitle,
        notes: cleanNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Auto-log Expense & Savings in Student Budget Ledger
      batch.set(doc(db, 'expenses', expenseId), {
        userId: userUid,
        title: `CampusFin ${serviceType}`,
        category: 'Laundry',
        amountInr: priceInr,
        savedInr: savedVsCommercial,
        date: pickupDate,
        linkedOrderId: orderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Automatically link Academic Deadline if selected
      if (selectedDeadline) {
        batch.update(doc(db, 'deadlines', selectedDeadline.id), {
          laundryLinked: true,
          linkedOrderId: orderId,
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Sync hostel & room onto user profile for faster future reorders
      if (profile) {
        batch.update(doc(db, 'users', userUid), {
          displayName: cleanName,
          hostelBlock: cleanHostel,
          roomNumber: cleanRoom,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      const whatsappText = [
        `CampusFin Pickup Confirmed (${batchCode})`,
        `Order ID: ${orderId}`,
        `Student: ${cleanName} · ${cleanHostel}, Room ${cleanRoom}`,
        `Schedule: ${pickupDate} · ${pickupSlot}`,
        `Package: ${serviceType} (${formatInr(priceInr)})`,
        `Partner: ${assignedPartner}`,
        linkedTitle ? `Deadline Sync: ${linkedTitle}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      setLastOrderSummary(whatsappText);
      setUpiReference('');
      setNotes('');
      setLinkedDeadlineId('');
      onBookingSuccess(orderId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyReceipt = async () => {
    if (!lastOrderSummary) return;
    await navigator.clipboard.writeText(lastOrderSummary);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Lead */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            DGU Hostel &amp; PG Door-to-Door Operations · 24h Turnaround
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1 text-balance">
            Schedule Your Campus Laundry Pickup
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Every booking automatically assigns your hostel batch, dispatches a local laundry partner, logs your ₹150 spend in your monthly budget, and syncs with upcoming MBA deadlines.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
          <span>MVP Standard: {formatInr(150)}/order</span>
          <span aria-hidden="true">·</span>
          <span>Save up to {formatInr(200)} vs commercial</span>
        </div>
      </div>

      {/* Deadline-Aware Automation Prompt */}
      {upcomingUnlinkedDeadlines.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pre-Deadline Automation Ready: {upcomingUnlinkedDeadlines[0].title}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Due {upcomingUnlinkedDeadlines[0].dueDate} · {upcomingUnlinkedDeadlines[0].course} · Schedule pickup 48 hrs ahead so clean clothes arrive before crunch week.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleApplySmartDeadline(upcomingUnlinkedDeadlines[0])}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            Auto-Fill Pre-Deadline Slot
          </button>
        </div>
      )}

      {/* 12-col Split Booking & Automation Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
        >
          {/* Step 1: Service Package */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Select Laundry Bundle
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Wash, steam iron &amp; hostel delivery included
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SERVICE_PACKAGES.map((pkg) => {
                const selected = serviceType === pkg.type;
                return (
                  <button
                    key={pkg.type}
                    type="button"
                    onClick={() => {
                      setServiceType(pkg.type);
                      setEstimatedKg(pkg.maxKg);
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      selected
                        ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatInr(pkg.priceInr)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        ≤ {pkg.maxKg} kg
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1.5">
                      {pkg.type}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {pkg.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Hostel & Pickup Schedule */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Hostel Location &amp; Pickup Window
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.displayNameMax}
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hostel / PG Block
                </label>
                <select
                  value={hostelBlock}
                  onChange={(e) => setHostelBlock(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {HOSTEL_BLOCKS.map((block) => (
                    <option key={block} value={block}>
                      {block}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Room / Flat No.
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.roomNumberMax}
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. A-204"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pickup Date
                </label>
                <input
                  type="date"
                  required
                  value={pickupDate}
                  min={getTodayIsoDate()}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pickup Slot
                </label>
                <select
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value as PickupSlot)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PICKUP_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Est. Load (kg)
                </label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={estimatedKg}
                  onChange={(e) => setEstimatedKg(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Payment & Academic Sync */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3. Payment &amp; Academic Sync
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Option
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        paymentMethod === method
                          ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  UPI Reference / UTR (Optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.upiReferenceMax}
                  value={upiReference}
                  onChange={(e) => setUpiReference(e.target.value)}
                  placeholder="e.g. UTR40928173645"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {deadlines.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Link to Academic Deadline (Optional)
                </label>
                <select
                  value={linkedDeadlineId}
                  onChange={(e) => setLinkedDeadlineId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">No deadline linked</option>
                  {deadlines
                    .filter((d) => !d.completed)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.dueDate} · {d.course})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Care Instructions / Hostel Gate Notes
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.notesMax}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Separate white shirts, call at hostel reception on arrival"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {userUid
                ? 'Automatically creates order, batch dispatch, and budget entry.'
                : 'Sign up or log in to confirm your scheduled pickup.'}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
            >
              {submitting
                ? 'Confirming Pickup...'
                : userUid
                  ? `Confirm Pickup · ${formatInr(activePackage.priceInr)}`
                  : 'Sign In to Book Pickup'}
            </button>
          </div>
        </form>

        {/* Right: Automated Dispatch & Receipt Panel */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Automated Dispatch Preview
              </h2>
              <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Assigned Batch</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {batchCode}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Laundry Partner</dt>
                <dd className="text-xs font-medium text-slate-900 dark:text-slate-100 text-right">
                  {assignedPartner}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Pickup Window</dt>
                <dd className="font-mono text-xs text-slate-900 dark:text-slate-100">
                  {pickupDate} · {pickupSlot}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Turnaround</dt>
                <dd className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {activePackage.turnaround} door-to-door
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Student Price</dt>
                <dd className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {formatInr(activePackage.priceInr)}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">
                  Savings vs. Commercial
                </dt>
                <dd className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  +{formatInr(savedVsCommercial)} saved
                </dd>
              </div>
            </dl>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>UPI ID for Prepaid Pilot Orders: <strong className="font-mono text-slate-900 dark:text-slate-100">campusfin.dgu@upi</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Auto-logs to your CampusFin Monthly Expense Ledger on confirmation.</span>
              </div>
            </div>
          </div>

          {lastOrderSummary && (
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Pickup Confirmed &amp; Dispatched
                </p>
                <button
                  type="button"
                  onClick={handleCopyReceipt}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors"
                >
                  {copiedReceipt ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy WhatsApp Slip
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-emerald-950 dark:text-emerald-100 whitespace-pre-wrap leading-relaxed">
                {lastOrderSummary}
              </pre>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
