import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { LaundryOrder, OrderStatus, VerifiedReview } from '../types';
import { formatInr, ORDER_PIPELINE_STEPS } from '../utils/validation';

interface OperationsViewProps {
  isAdmin: boolean;
  allOrders: LaundryOrder[];
  reviews: VerifiedReview[];
}

const FIXED_MONTHLY_COST = 15000;
const BASE_PRICE_INR = 150;
const BASE_VARIABLE_INR = 90;
const BASE_CONTRIBUTION_INR = 60;

const LAUNCH_PHASES = [
  {
    phase: 'Week 1 · Prepare',
    action: 'Conduct 25–30 student interviews on laundry pain, price & pickup windows.',
    target: '30 conversations · 15+ interested',
    question: 'Do students consider laundry pickup a real problem worth paying for?',
  },
  {
    phase: 'Week 2 · Launch Pilot',
    action: 'Launch pilot with first 20 hostel/PG students using scheduled pickup & delivery.',
    target: '20 trial customers · 15+ completed orders',
    question: 'Will students actually book and pay ₹150 after showing interest?',
  },
  {
    phase: 'Week 3 · Measure',
    action: 'Collect verified ratings on punctuality, wash quality, pricing & repeat intent.',
    target: '15+ responses · ≥ 80% satisfaction',
    question: 'Are students satisfied enough to reorder and refer hostel peers?',
  },
  {
    phase: 'Week 4 · Learn & Adjust',
    action: 'Resolve top 3 operational bottlenecks & tune hostel pickup batches.',
    target: '2+ workflow improvements · ≥ 30% repeat rate',
    question: 'Which operational step needs refinement before expanding across Dehradun?',
  },
];

const COMPETITORS = [
  {
    name: 'Local Laundry / Dhobi',
    type: 'Direct Competitor',
    price: '₹50–₹100 / kg',
    offer: 'Neighborhood washing & ironing',
    position: 'Affordable, but unscheduled pickup and inconsistent turnaround.',
  },
  {
    name: 'Tumbledry',
    type: 'Direct Competitor',
    price: '₹80–₹150 / kg',
    offer: 'Commercial dry-cleaning & app pickup',
    position: 'Organized logistics, but expensive for student budgets & hostel routines.',
  },
  {
    name: 'Washing Clothes Yourself',
    type: 'Substitute',
    price: '₹0–₹30 direct',
    offer: 'Self-wash in hostel facilities',
    position: 'Zero service fee, but consumes 3+ hours during MBA deadline weeks.',
  },
  {
    name: 'CampusFin (MVP)',
    type: 'Venture Position',
    price: '₹150 / order flat',
    offer: 'Hostel batch pickup, wash, steam iron & delivery + budget/deadline sync',
    position: 'High convenience at predictable student pricing tailored to DGU hostels.',
  },
];

export const OperationsView: React.FC<OperationsViewProps> = ({
  isAdmin,
  allOrders,
  reviews,
}) => {
  const [simulatedUnits, setSimulatedUnits] = useState<number>(250);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const simMetrics = useMemo(() => {
    const revenue = simulatedUnits * BASE_PRICE_INR;
    const variableCost = simulatedUnits * BASE_VARIABLE_INR;
    const contribution = simulatedUnits * BASE_CONTRIBUTION_INR;
    const surplus = contribution - FIXED_MONTHLY_COST;
    return { revenue, variableCost, contribution, surplus };
  }, [simulatedUnits]);

  const liveTelemetry = useMemo(() => {
    const activeValidOrders = allOrders.filter((o) => o.status !== 'Cancelled');
    const uniqueCustomers = new Set(activeValidOrders.map((o) => o.userId));
    const ordersPerCustomer = new Map<string, number>();
    for (const o of activeValidOrders) {
      ordersPerCustomer.set(o.userId, (ordersPerCustomer.get(o.userId) || 0) + 1);
    }
    const repeatCustomers = Array.from(ordersPerCustomer.values()).filter(
      (c) => c >= 2
    ).length;
    const repeatRate =
      uniqueCustomers.size > 0
        ? Math.round((repeatCustomers / uniqueCustomers.size) * 100)
        : 0;
    const totalRevenue = activeValidOrders.reduce((s, o) => s + o.priceInr, 0);
    const totalContribution = activeValidOrders.reduce(
      (s, o) => s + o.contributionInr,
      0
    );
    const satisfactionPct =
      reviews.length > 0
        ? Math.round(
            (reviews.filter((r) => r.wouldRecommend).length / reviews.length) * 100
          )
        : 0;

    return {
      orderCount: activeValidOrders.length,
      deliveredCount: activeValidOrders.filter((o) => o.status === 'Delivered').length,
      repeatRate,
      totalRevenue,
      totalContribution,
      satisfactionPct,
    };
  }, [allOrders, reviews]);

  const batchCodes = useMemo(() => {
    const groups = new Map<string, LaundryOrder[]>();
    for (const o of allOrders) {
      if (o.status === 'Delivered' || o.status === 'Cancelled') continue;
      const list = groups.get(o.batchCode) || [];
      list.push(o);
      groups.set(o.batchCode, list);
    }
    return Array.from(groups.entries());
  }, [allOrders]);

  const filteredAdminOrders = useMemo(() => {
    if (statusFilter === 'all') return allOrders;
    return allOrders.filter((o) => o.status === statusFilter);
  }, [allOrders, statusFilter]);

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    const idx = ORDER_PIPELINE_STEPS.indexOf(current);
    if (idx === -1 || idx >= ORDER_PIPELINE_STEPS.length - 1) return null;
    return ORDER_PIPELINE_STEPS[idx + 1];
  };

  const handleAdvanceOrder = async (order: LaundryOrder) => {
    const next = getNextStatus(order.status);
    if (!next) return;
    setBusyId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleVerifyPayment = async (order: LaundryOrder) => {
    setBusyId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'Verified',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchAdvance = async (batchCode: string, batchOrders: LaundryOrder[]) => {
    setBusyId(batchCode);
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;
      for (const order of batchOrders) {
        const next = getNextStatus(order.status);
        if (next) {
          batch.update(doc(db, 'orders', order.id), {
            status: next,
            updatedAt: serverTimestamp(),
          });
          updatedCount += 1;
        }
      }
      if (updatedCount > 0) {
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/batch-${batchCode}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            CampusFin Venture Operations · DGU Global University Pilot
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            {isAdmin ? 'Automated Operations & Unit Economics' : 'Venture Blueprint & Unit Economics'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {isAdmin
              ? 'Dispatch hostel batches, verify student UPI payments, and monitor live break-even and pilot validation milestones.'
              : 'Explore CampusFin’s transparent ₹150 unit economics, competitive positioning, and 30-day Dehradun pilot roadmap.'}
          </p>
        </div>
      </div>

      {/* Admin-Only Live Automated Dispatch Console */}
      {isAdmin ? (
        <section className="space-y-6">
          {/* Pilot Validation Telemetry */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Pilot Orders (Goal: 20)
              </span>
              <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {liveTelemetry.orderCount} / 20
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {liveTelemetry.deliveredCount} delivered
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Live Contribution Margin
              </span>
              <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatInr(liveTelemetry.totalContribution)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Rev: {formatInr(liveTelemetry.totalRevenue)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Repeat Order Rate (Goal: 30%)
              </span>
              <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {liveTelemetry.repeatRate}%
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Section 16 Assumption #3
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Verified Satisfaction (Goal: 80%)
              </span>
              <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {reviews.length > 0 ? `${liveTelemetry.satisfactionPct}%` : '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {reviews.length} verified reviews
              </p>
            </div>
          </div>

          {/* Batch Auto-Dispatch */}
          {batchCodes.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Active Hostel Batches · 1-Click Batch Progression
                </h2>
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {batchCodes.map(([code, items]) => (
                  <div
                    key={code}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {code}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {items.length} active order{items.length > 1 ? 's' : ''} · {items[0].assignedPartner}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === code}
                      onClick={() => handleBatchAdvance(code, items)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0"
                    >
                      Advance Batch
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Orders Dispatch Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                All Student Orders Dispatch Queue
              </h2>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Statuses ({allOrders.length})</option>
                {ORDER_PIPELINE_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {filteredAdminOrders.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No orders in this queue yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-3 px-4 font-medium">Batch / Date</th>
                      <th className="py-3 px-4 font-medium">Student &amp; Hostel</th>
                      <th className="py-3 px-4 font-medium">Package</th>
                      <th className="py-3 px-4 font-medium text-right">Amount</th>
                      <th className="py-3 px-4 font-medium">UPI / Payment</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Automation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAdminOrders.map((order) => {
                      const next = getNextStatus(order.status);
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                        >
                          <td className="py-3 px-4 font-mono tabular-nums">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {order.batchCode}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {order.pickupDate}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {order.studentName}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {order.hostelBlock} · {order.roomNumber}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                            {order.serviceType}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {formatInr(order.priceInr)}
                          </td>
                          <td className="py-3 px-4">
                            {order.paymentStatus === 'Verified' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verified
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleVerifyPayment(order)}
                                className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-medium"
                              >
                                Verify {order.upiReference ? `(${order.upiReference})` : 'Payment'}
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                            {order.status}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {next ? (
                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleAdvanceOrder(order)}
                                className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 font-medium whitespace-nowrap"
                              >
                                Move to {next}
                              </button>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">
                                Complete
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="bg-slate-100/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Live batch dispatch &amp; UPI verification controls are restricted to authorized CampusFin venture operators. Below is the complete public unit economics simulator and launch roadmap.
          </span>
        </div>
      )}

      {/* Interactive Unit Economics & Break-Even Simulator (Sections 9-11) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Unit Economics &amp; Break-Even Simulator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Based on ₹150 selling price, ₹90 partner/pickup variable cost (40.0% contribution margin), and ₹15,000 monthly fixed operating cost.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
            {[
              { label: 'Conservative (0)', val: 0 },
              { label: 'Base / Break-Even (250)', val: 250 },
              { label: 'Ambitious (600)', val: 600 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSimulatedUnits(preset.val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  simulatedUnits === preset.val
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">
              Simulated Monthly Orders
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {simulatedUnits} orders / month
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={750}
            step={10}
            value={simulatedUnits}
            onChange={(e) => setSimulatedUnits(Number(e.target.value))}
            aria-label="Simulate monthly order volume"
            className="w-full accent-emerald-600"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Monthly Revenue</p>
            <p className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1">
              {formatInr(simMetrics.revenue)}
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gross Contribution (40%)
            </p>
            <p className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1">
              {formatInr(simMetrics.contribution)}
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operating Surplus / Deficit
            </p>
            <p
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                simMetrics.surplus >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {simMetrics.surplus >= 0 ? '+' : ''}
              {formatInr(simMetrics.surplus)}
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Market Scope (TAM / SAM / SOM)
            </p>
            <p className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1.5">
              5,000 / 2,000 / 250
            </p>
          </div>
        </div>
      </section>

      {/* Competition Matrix & 30-Day Launch Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Competitive Positioning (Dehradun Campus)
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {COMPETITORS.map((comp) => (
              <div key={comp.name} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {comp.name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {comp.price}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {comp.type} · {comp.offer}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {comp.position}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            30-Day Launch &amp; Validation Roadmap
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {LAUNCH_PHASES.map((item) => (
              <div key={item.phase} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {item.phase}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {item.target}
                  </span>
                </div>
                <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                  {item.action}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Learning Goal: {item.question}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
