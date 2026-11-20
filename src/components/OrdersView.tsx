import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Package,
  RotateCcw,
  Search,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { LaundryOrder, OrderStatus } from '../types';
import {
  addDaysIsoDate,
  BLUEPRINT_LIMITS,
  formatInr,
  getTodayIsoDate,
  ORDER_PIPELINE_STEPS,
  sanitizeText,
} from '../utils/validation';

interface OrdersViewProps {
  userUid: string | null;
  orders: LaundryOrder[];
  loading: boolean;
  onRequireAuth: (mode: 'login' | 'signup') => void;
  onGoToBook: () => void;
  onReorder: (order: LaundryOrder) => void;
  onReviewOrder: (orderId: string) => void;
}

type OrderFilter = 'all' | 'active' | 'delivered' | 'cancelled';

export const OrdersView: React.FC<OrdersViewProps> = ({
  userUid,
  orders,
  loading,
  onRequireAuth,
  onGoToBook,
  onReorder,
  onReviewOrder,
}) => {
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUpiId, setEditingUpiId] = useState<string | null>(null);
  const [upiInput, setUpiInput] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === 'active') {
        if (order.status === 'Delivered' || order.status === 'Cancelled') return false;
      } else if (filter === 'delivered') {
        if (order.status !== 'Delivered') return false;
      } else if (filter === 'cancelled') {
        if (order.status !== 'Cancelled') return false;
      }
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.batchCode.toLowerCase().includes(q) ||
        order.hostelBlock.toLowerCase().includes(q) ||
        order.serviceType.toLowerCase().includes(q) ||
        order.linkedDeadlineTitle.toLowerCase().includes(q)
      );
    });
  }, [orders, filter, searchQuery]);

  const handleCancelOrder = async (order: LaundryOrder) => {
    if (order.status !== 'Scheduled') return;
    setBusyOrderId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleSaveUpi = async (order: LaundryOrder) => {
    const cleanUpi = sanitizeText(upiInput, BLUEPRINT_LIMITS.upiReferenceMax);
    if (!cleanUpi) return;
    setBusyOrderId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        upiReference: cleanUpi,
        notes: order.notes,
        updatedAt: serverTimestamp(),
      });
      setEditingUpiId(null);
      setUpiInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const getStatusIndicator = (status: OrderStatus) => {
    if (status === 'Delivered') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Delivered
        </span>
      );
    }
    if (status === 'Cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
          <XCircle className="w-3.5 h-3.5" />
          Cancelled
        </span>
      );
    }
    if (status === 'Out for Delivery') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <Truck className="w-3.5 h-3.5" />
          Out for Delivery
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <Clock className="w-3.5 h-3.5" />
        {status}
      </span>
    );
  };

  if (!userUid) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center max-w-xl mx-auto my-8 space-y-4">
        <Package className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Sign in to track your campus laundry orders
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          View live pickup-to-delivery stages, attach UPI transaction IDs, reorder in one click, and leave verified reviews after delivery.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onRequireAuth('login')}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => onRequireAuth('signup')}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            Sign Up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Automated Pickup-to-Delivery Pipeline
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            My Laundry Orders
          </h1>
        </div>
        <button
          type="button"
          onClick={onGoToBook}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          Book New Pickup
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
          {(
            [
              ['all', 'All Orders'],
              ['active', 'In Progress'],
              ['delivered', 'Delivered'],
              ['cancelled', 'Cancelled'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batch, hostel, or order ID..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-32 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No matching laundry orders yet
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Schedule your first ₹150 hostel pickup to activate automated batch routing, budget tracking, and delivery status updates.
          </p>
          <button
            type="button"
            onClick={onGoToBook}
            className="mt-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            Schedule First Pickup
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const activeStepIdx = ORDER_PIPELINE_STEPS.indexOf(order.status);
            return (
              <article
                key={order.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{order.batchCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{order.pickupDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{order.pickupSlot}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {order.serviceType}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {order.hostelBlock} · Room {order.roomNumber} · Partner: {order.assignedPartner}
                      {order.linkedDeadlineTitle
                        ? ` · Synced to "${order.linkedDeadlineTitle}"`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 md:text-right">
                    <div>
                      <p className="font-mono text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatInr(order.priceInr)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {order.paymentMethod} · Payment {order.paymentStatus}
                      </p>
                    </div>
                    {getStatusIndicator(order.status)}
                  </div>
                </div>

                {/* Visual 5-step pipeline */}
                {order.status !== 'Cancelled' && (
                  <div className="grid grid-cols-5 gap-2 pt-2">
                    {ORDER_PIPELINE_STEPS.map((step, idx) => {
                      const reached = activeStepIdx >= idx;
                      return (
                        <div key={step} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-colors ${
                              reached
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                          <p
                            className={`text-[11px] leading-tight ${
                              reached
                                ? 'font-semibold text-slate-900 dark:text-slate-100'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {step}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Order Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
                    <span className="font-mono">
                      Est. {order.estimatedKg} kg
                    </span>
                    {order.upiReference && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">UTR: {order.upiReference}</span>
                      </>
                    )}
                    {order.notes && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Note: {order.notes}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {order.status === 'Scheduled' && (
                      <>
                        {editingUpiId === order.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={upiInput}
                              onChange={(e) => setUpiInput(e.target.value)}
                              maxLength={BLUEPRINT_LIMITS.upiReferenceMax}
                              placeholder="Enter UPI Ref"
                              className="px-2.5 py-1 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              disabled={busyOrderId === order.id}
                              onClick={() => handleSaveUpi(order)}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUpiId(null)}
                              className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUpiId(order.id);
                              setUpiInput(order.upiReference || '');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-colors"
                          >
                            {order.upiReference ? 'Edit UPI Ref' : 'Attach UPI Ref'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          onClick={() => handleCancelOrder(order)}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-medium transition-colors"
                        >
                          Cancel Order
                        </button>
                      </>
                    )}

                    {order.status === 'Delivered' && (
                      <button
                        type="button"
                        onClick={() => onReviewOrder(order.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                      >
                        <Star className="w-3.5 h-3.5" />
                        Leave Verified Review
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        onReorder({
                          ...order,
                          pickupDate: addDaysIsoDate(getTodayIsoDate(), 1),
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reorder
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
