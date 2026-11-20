import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { BookPickupView } from './components/BookPickupView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OperationsView } from './components/OperationsView';
import { OrdersView } from './components/OrdersView';
import { PlannerBudgetView } from './components/PlannerBudgetView';
import { ReviewsView } from './components/ReviewsView';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  AcademicDeadline,
  ActiveView,
  LaundryOrder,
  StudentExpense,
  UserProfile,
  VerifiedReview,
} from './types';
import {
  ADMIN_EMAIL,
  BLUEPRINT_LIMITS,
  HOSTEL_BLOCKS,
  sanitizeText,
} from './utils/validation';

function CampusFinWorkspace() {
  // Theme state with localStorage + system preference fallback
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('campusfin-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    window.localStorage.setItem('campusfin-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Auth & Profile state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [verifyTick, setVerifyTick] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [pendingSeed, setPendingSeed] = useState<{
    displayName: string;
    hostelBlock: string;
    program: string;
  } | null>(null);

  // Modal & Nav state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [activeView, setActiveView] = useState<ActiveView>('book');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Verification banner feedback
  const [verifyNotice, setVerifyNotice] = useState('');

  // Firestore synced collections
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [adminOrders, setAdminOrders] = useState<LaundryOrder[]>([]);
  const [reviews, setReviews] = useState<VerifiedReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [deadlines, setDeadlines] = useState<AcademicDeadline[]>([]);
  const [expenses, setExpenses] = useState<StudentExpense[]>([]);

  // Cross-view handoff states
  const [prefillOrder, setPrefillOrder] = useState<Partial<LaundryOrder> | null>(
    null
  );
  const [preselectedReviewOrderId, setPreselectedReviewOrderId] = useState<
    string | null
  >(null);

  const isBootstrappedAdmin = useMemo(
    () =>
      Boolean(
        user &&
          user.emailVerified &&
          user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      ),
    [user, verifyTick]
  );

  const isAdmin = isBootstrappedAdmin || isAdminDoc;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Ensure user profile & admin check once verified
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setProfile(null);
      setIsAdminDoc(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const adminRef = doc(db, 'admins', user.uid);

    const ensureProfile = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const cleanName = sanitizeText(
            pendingSeed?.displayName || user.displayName || 'DGU Student',
            BLUEPRINT_LIMITS.displayNameMax
          );
          const cleanEmail = sanitizeText(
            user.email || 'student@dgu.ac.in',
            BLUEPRINT_LIMITS.emailMax
          );
          const cleanHostel = sanitizeText(
            pendingSeed?.hostelBlock || HOSTEL_BLOCKS[0],
            BLUEPRINT_LIMITS.hostelBlockMax
          );
          const cleanProgram = sanitizeText(
            pendingSeed?.program || 'MBA Year 1 · DGU',
            BLUEPRINT_LIMITS.programMax
          );

          await setDoc(userRef, {
            uid: user.uid,
            displayName: cleanName,
            email: cleanEmail,
            hostelBlock: cleanHostel,
            roomNumber: '204',
            phone: '',
            program: cleanProgram,
            monthlyBudget: 8000,
            role: 'student',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setPendingSeed(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    };

    void ensureProfile();

    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const unsubAdmin = onSnapshot(
      adminRef,
      (snap) => {
        setIsAdminDoc(snap.exists());
      },
      () => {
        setIsAdminDoc(false);
      }
    );

    return () => {
      unsubUser();
      unsubAdmin();
    };
  }, [authReady, user, pendingSeed, verifyTick]);

  // Public Reviews Listener
  useEffect(() => {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(
      reviewsQuery,
      (snap) => {
        setReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<VerifiedReview, 'id'>),
          }))
        );
        setReviewsLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );
    return () => unsub();
  }, []);

  // Verified User Private Listeners (Orders, Deadlines, Expenses)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setOrders([]);
      setAdminOrders([]);
      setDeadlines([]);
      setExpenses([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);
    const myOrdersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      limit(100)
    );

    const unsubOrders = onSnapshot(
      myOrdersQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LaundryOrder, 'id'>),
        }));
        list.sort((a, b) => b.pickupDate.localeCompare(a.pickupDate));
        setOrders(list);
        setOrdersLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const myDeadlinesQuery = query(
      collection(db, 'deadlines'),
      where('userId', '==', user.uid),
      limit(100)
    );

    const unsubDeadlines = onSnapshot(
      myDeadlinesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AcademicDeadline, 'id'>),
        }));
        list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        setDeadlines(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'deadlines')
    );

    const myExpensesQuery = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid),
      limit(100)
    );

    const unsubExpenses = onSnapshot(
      myExpensesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StudentExpense, 'id'>),
        }));
        list.sort((a, b) => b.date.localeCompare(a.date));
        setExpenses(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
    );

    return () => {
      unsubOrders();
      unsubDeadlines();
      unsubExpenses();
    };
  }, [authReady, user, verifyTick]);

  // Admin All-Orders Listener
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !isBootstrappedAdmin) {
      setAdminOrders([]);
      return;
    }
    const allOrdersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(
      allOrdersQuery,
      (snap) => {
        setAdminOrders(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<LaundryOrder, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );
    return () => unsub();
  }, [authReady, user, isBootstrappedAdmin]);

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyNotice('Verification link re-sent. Check your inbox and click Refresh Status.');
    } catch (err) {
      setVerifyNotice(err instanceof Error ? err.message : 'Unable to send email.');
    }
  };

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true);
      setVerifyNotice('');
    } else {
      setVerifyNotice('Still pending verification. Click the link in your email first.');
    }
    setVerifyTick((t) => t + 1);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const navItems: {
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'book', label: 'Book Pickup', icon: Sparkles },
    { id: 'orders', label: 'My Orders', icon: ClipboardList },
    { id: 'planner', label: 'Deadlines & Budget', icon: CalendarClock },
    { id: 'reviews', label: 'Verified Reviews', icon: Star },
    { id: 'operations', label: 'Venture & Ops', icon: LayoutDashboard },
  ];

  const activeBreadcrumb =
    navItems.find((item) => item.id === activeView)?.label || 'Book Pickup';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('book');
            }}
            className="text-xl font-bold tracking-tight font-display text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            CampusFin
          </a>
        </div>

        <nav className="flex-1 p-4 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {user ? (
            <div className="space-y-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {profile?.displayName || user.displayName || 'CampusFin Member'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.email}
                </p>
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {user.emailVerified
                      ? isAdmin
                        ? 'Verified Operator'
                        : 'Verified Student'
                      : 'Email Unverified'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              DGU Global University &amp; Dehradun Student Pilot
            </p>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-lg font-bold font-display">CampusFin</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            {user && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, Theme Toggle + Auth Actions on Right */}
        <header className="h-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="lg:hidden font-bold font-display text-slate-900 dark:text-slate-100">
                CampusFin
              </span>
              <span className="lg:hidden text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="hidden lg:inline text-slate-500 dark:text-slate-400">
                CampusFin
              </span>
              <span className="hidden lg:inline text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeBreadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              aria-pressed={isDark}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setIsDark((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>

            {!user ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => openAuth('signup')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Sign Up
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView('orders')}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
              >
                <span>{profile?.displayName || user.displayName || 'Account'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Email Verification Gate Banner if unverified */}
        {user && !user.emailVerified && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Verify your email ({user.email})</strong> to unlock scheduled laundry bookings, budget sync, and verified reviews.{' '}
              {verifyNotice && <span className="underline ml-1">{verifyNotice}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResendVerification}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100/60"
              >
                Resend Email
              </button>
              <button
                type="button"
                onClick={handleRefreshVerification}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh Status
              </button>
            </div>
          </div>
        )}

        {/* Viewport Container */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {activeView === 'book' && (
            <BookPickupView
              userUid={user?.uid || null}
              emailVerified={Boolean(user?.emailVerified)}
              profile={profile}
              deadlines={deadlines}
              prefillOrder={prefillOrder}
              onClearPrefill={() => setPrefillOrder(null)}
              onRequireAuth={openAuth}
              onBookingSuccess={() => {
                // Keep confirmation slip visible; user can navigate to orders anytime
              }}
            />
          )}

          {activeView === 'orders' && (
            <OrdersView
              userUid={user?.uid || null}
              orders={orders}
              loading={ordersLoading}
              onRequireAuth={openAuth}
              onGoToBook={() => setActiveView('book')}
              onReorder={(order) => {
                setPrefillOrder(order);
                setActiveView('book');
              }}
              onReviewOrder={(orderId) => {
                setPreselectedReviewOrderId(orderId);
                setActiveView('reviews');
              }}
            />
          )}

          {activeView === 'planner' && (
            <PlannerBudgetView
              userUid={user?.uid || null}
              emailVerified={Boolean(user?.emailVerified)}
              profile={profile}
              deadlines={deadlines}
              expenses={expenses}
              onRequireAuth={openAuth}
              onScheduleForDeadline={(prefill) => {
                setPrefillOrder(prefill);
                setActiveView('book');
              }}
            />
          )}

          {activeView === 'reviews' && (
            <ReviewsView
              userUid={user?.uid || null}
              emailVerified={Boolean(user?.emailVerified)}
              isAdmin={isAdmin}
              profile={profile}
              orders={orders}
              reviews={reviews}
              loading={reviewsLoading}
              preselectedOrderId={preselectedReviewOrderId}
              onClearPreselectedOrder={() => setPreselectedReviewOrderId(null)}
              onRequireAuth={openAuth}
            />
          )}

          {activeView === 'operations' && (
            <OperationsView
              isAdmin={isAdmin}
              allOrders={isAdmin ? adminOrders : orders}
              reviews={reviews}
            />
          )}
        </main>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onProfileSeed={(seed) => setPendingSeed(seed)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CampusFinWorkspace />
    </ErrorBoundary>
  );
}
