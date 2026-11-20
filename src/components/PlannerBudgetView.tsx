import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  CalendarCheck2,
  CheckSquare,
  Plus,
  Square,
  Trash2,
  Wallet,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AcademicDeadline,
  DeadlineType,
  ExpenseCategory,
  LaundryOrder,
  StudentExpense,
  UserProfile,
} from '../types';
import {
  addDaysIsoDate,
  BLUEPRINT_LIMITS,
  DEADLINE_TYPES,
  EXPENSE_CATEGORIES,
  formatInr,
  generateSafeId,
  getTodayIsoDate,
  sanitizeText,
} from '../utils/validation';

interface PlannerBudgetViewProps {
  userUid: string | null;
  emailVerified: boolean;
  profile: UserProfile | null;
  deadlines: AcademicDeadline[];
  expenses: StudentExpense[];
  onRequireAuth: (mode: 'login' | 'signup') => void;
  onScheduleForDeadline: (prefill: Partial<LaundryOrder>) => void;
}

export const PlannerBudgetView: React.FC<PlannerBudgetViewProps> = ({
  userUid,
  emailVerified,
  profile,
  deadlines,
  expenses,
  onRequireAuth,
  onScheduleForDeadline,
}) => {
  // Deadline form state
  const [dlTitle, setDlTitle] = useState('');
  const [dlCourse, setDlCourse] = useState('');
  const [dlType, setDlType] = useState<DeadlineType>('Assignment');
  const [dlDate, setDlDate] = useState(addDaysIsoDate(getTodayIsoDate(), 4));
  const [dlHours, setDlHours] = useState(4);

  // Expense form state
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Food & Mess');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getTodayIsoDate());

  // Budget edit state
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(
    String(profile?.monthlyBudget || 8000)
  );
  const [submitting, setSubmitting] = useState(false);

  const monthlyBudget = profile?.monthlyBudget ?? 8000;

  const { totalSpent, totalSaved, remainingBudget, categoryTotals } = useMemo(() => {
    const spent = expenses.reduce((sum, item) => sum + item.amountInr, 0);
    const saved = expenses.reduce((sum, item) => sum + item.savedInr, 0);
    const cats = new Map<ExpenseCategory, number>();
    for (const item of expenses) {
      cats.set(item.category, (cats.get(item.category) || 0) + item.amountInr);
    }
    return {
      totalSpent: spent,
      totalSaved: saved,
      remainingBudget: Math.max(0, monthlyBudget - spent),
      categoryTotals: Array.from(cats.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [expenses, monthlyBudget]);

  const activeDeadlinesCount = useMemo(
    () => deadlines.filter((d) => !d.completed).length,
    [deadlines]
  );

  const handleAddDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUid) return onRequireAuth('signup');
    if (!emailVerified) return;

    const cleanTitle = sanitizeText(dlTitle, BLUEPRINT_LIMITS.deadlineTitleMax);
    const cleanCourse = sanitizeText(dlCourse, BLUEPRINT_LIMITS.courseMax);
    if (!cleanTitle || !cleanCourse || dlDate.length !== 10) return;

    const deadlineId = generateSafeId('dl');
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'deadlines', deadlineId), {
        userId: userUid,
        title: cleanTitle,
        course: cleanCourse,
        type: dlType,
        dueDate: dlDate,
        workloadHours: Math.min(40, Math.max(1, Number(dlHours) || 3)),
        laundryLinked: false,
        linkedOrderId: '',
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDlTitle('');
      setDlCourse('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `deadlines/${deadlineId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDeadline = async (dl: AcademicDeadline) => {
    try {
      await updateDoc(doc(db, 'deadlines', dl.id), {
        completed: !dl.completed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deadlines/${dl.id}`);
    }
  };

  const handleDeleteDeadline = async (deadlineId: string) => {
    try {
      await deleteDoc(doc(db, 'deadlines', deadlineId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `deadlines/${deadlineId}`);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUid) return onRequireAuth('signup');
    if (!emailVerified) return;

    const cleanTitle = sanitizeText(expTitle, BLUEPRINT_LIMITS.expenseTitleMax);
    const numericAmount = Number(expAmount);
    if (!cleanTitle || !Number.isFinite(numericAmount) || numericAmount <= 0) return;

    const expenseId = generateSafeId('exp');
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'expenses', expenseId), {
        userId: userUid,
        title: cleanTitle,
        category: expCategory,
        amountInr: Math.min(100000, Math.round(numericAmount)),
        savedInr: 0,
        date: expDate,
        linkedOrderId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setExpTitle('');
      setExpAmount('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `expenses/${expenseId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseId}`);
    }
  };

  const handleSaveBudget = async () => {
    if (!userUid || !emailVerified) return;
    const val = Math.min(500000, Math.max(0, Number(budgetDraft) || 0));
    try {
      await updateDoc(doc(db, 'users', userUid), {
        monthlyBudget: val,
        updatedAt: serverTimestamp(),
      });
      setEditingBudget(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userUid}`);
    }
  };

  if (!userUid) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center max-w-xl mx-auto my-8 space-y-4">
        <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Sign in to manage academic deadlines &amp; monthly student budget
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Track MBA assignments, presentations, and group projects alongside your monthly student expenses and CampusFin laundry savings.
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
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Academic Crunch Relief &amp; Student Personal Finance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            Deadlines &amp; Monthly Budget
          </h1>
        </div>
      </div>

      {/* 4-Col KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Monthly Allowance
            </span>
            {!editingBudget ? (
              <button
                type="button"
                onClick={() => {
                  setBudgetDraft(String(monthlyBudget));
                  setEditingBudget(true);
                }}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Edit
              </button>
            ) : null}
          </div>
          {editingBudget ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-28 px-2 py-1 text-sm font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleSaveBudget}
                className="px-2 py-1 text-xs font-semibold rounded bg-emerald-600 text-white"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {formatInr(monthlyBudget)}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Logged Expenses
          </span>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {formatInr(totalSpent)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatInr(remainingBudget)} remaining
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            CampusFin Savings
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatInr(totalSaved)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            vs. commercial laundry rates
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Active Deadlines
          </span>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {activeDeadlinesCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Synced for pre-crunch pickup
          </p>
        </div>
      </div>

      {/* Main Split: Deadlines (Left) & Budget Ledger (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Academic Deadlines */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              MBA Academic Deadline Planner
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prevent submission-week laundry stress by auto-scheduling pickups 48 hrs before deadlines.
            </p>
          </div>

          <form onSubmit={handleAddDeadline} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.deadlineTitleMax}
              value={dlTitle}
              onChange={(e) => setDlTitle(e.target.value)}
              placeholder="e.g. Venture Quest Presentation"
              className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.courseMax}
              value={dlCourse}
              onChange={(e) => setDlCourse(e.target.value)}
              placeholder="Course (e.g. Corporate Finance)"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select
              value={dlType}
              onChange={(e) => setDlType(e.target.value as DeadlineType)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {DEADLINE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={dlDate}
              onChange={(e) => setDlDate(e.target.value)}
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={40}
                value={dlHours}
                onChange={(e) => setDlHours(Number(e.target.value))}
                className="w-20 px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                aria-label="Workload hours"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">hrs</span>
              <button
                type="submit"
                disabled={submitting || !emailVerified}
                className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            </div>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {deadlines.length === 0 ? (
              <p className="py-6 text-xs text-center text-slate-500 dark:text-slate-400">
                No academic tasks logged yet. Add upcoming presentations or group projects above.
              </p>
            ) : (
              deadlines.map((dl) => (
                <div
                  key={dl.id}
                  className="py-3.5 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleDeadline(dl)}
                      aria-label={`Mark ${dl.title} complete`}
                      className="mt-0.5 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                    >
                      {dl.completed ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          dl.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {dl.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                        {dl.course} · {dl.type} · Due {dl.dueDate} · {dl.workloadHours}h
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!dl.completed && !dl.laundryLinked && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetPickup = addDaysIsoDate(dl.dueDate, -2);
                          const today = getTodayIsoDate();
                          onScheduleForDeadline({
                            pickupDate: targetPickup >= today ? targetPickup : today,
                            serviceType:
                              dl.type === 'Presentation'
                                ? 'Formal & Presentation Wear'
                                : 'Regular Wash & Steam Iron',
                            linkedDeadlineTitle: dl.title,
                          });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      >
                        <CalendarCheck2 className="w-3.5 h-3.5" />
                        Book Pickup
                      </button>
                    )}
                    {dl.laundryLinked && (
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Pickup Synced
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteDeadline(dl.id)}
                      aria-label={`Delete ${dl.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Student Budget & Expense Ledger */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Student Expense &amp; Savings Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Laundry orders log automatically. Add food, transport, and hostel expenses to stay on budget.
            </p>
          </div>

          <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.expenseTitleMax}
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="Expense description (e.g. Hostel Mess)"
              className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              required
              min={1}
              max={100000}
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="Amount (INR)"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <input
              type="date"
              required
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={submitting || !emailVerified}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Expense
            </button>
          </form>

          {/* Category Progress */}
          {categoryTotals.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Spend Breakdown vs. {formatInr(monthlyBudget)} Allowance
              </p>
              {categoryTotals.map(([cat, amount]) => {
                const pct =
                  monthlyBudget > 0
                    ? Math.min(100, Math.round((amount / monthlyBudget) * 100))
                    : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                      <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatInr(amount)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Expense Table */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {expenses.length === 0 ? (
              <p className="py-6 text-xs text-center text-slate-500 dark:text-slate-400">
                No expenses recorded yet. Book a laundry pickup or add a student expense above.
              </p>
            ) : (
              expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {exp.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {exp.category} · {exp.date}
                      {exp.savedInr > 0 ? ` · Saved ${formatInr(exp.savedInr)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatInr(exp.amountInr)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp.id)}
                      aria-label={`Delete ${exp.title}`}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
