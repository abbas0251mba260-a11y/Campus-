import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  BadgeCheck,
  Edit3,
  MessageSquarePlus,
  Star,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { LaundryOrder, UserProfile, VerifiedReview } from '../types';
import {
  BLUEPRINT_LIMITS,
  generateSafeId,
  HOSTEL_BLOCKS,
  sanitizeText,
} from '../utils/validation';

interface ReviewsViewProps {
  userUid: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  profile: UserProfile | null;
  orders: LaundryOrder[];
  reviews: VerifiedReview[];
  loading: boolean;
  preselectedOrderId: string | null;
  onClearPreselectedOrder: () => void;
  onRequireAuth: (mode: 'login' | 'signup') => void;
}

type ReviewFilter = 'all' | '5star' | 'verified-order';
type ReviewSort = 'recent' | 'highest' | 'helpful';

const StarPicker: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
      {label}
    </span>
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`${star} out of 5 stars for ${label}`}
          className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Star
            className={`w-4 h-4 transition-colors ${
              star <= value
                ? 'fill-amber-400 text-amber-500'
                : 'text-slate-300 dark:text-slate-700'
            }`}
          />
        </button>
      ))}
    </div>
  </div>
);

export const ReviewsView: React.FC<ReviewsViewProps> = ({
  userUid,
  emailVerified,
  isAdmin,
  profile,
  orders,
  reviews,
  loading,
  preselectedOrderId,
  onClearPreselectedOrder,
  onRequireAuth,
}) => {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sortBy, setSortBy] = useState<ReviewSort>('recent');

  // Form state
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [punctualityRating, setPunctualityRating] = useState(5);
  const [qualityRating, setQualityRating] = useState(5);
  const [valueRating, setValueRating] = useState(5);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [comment, setComment] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [helpfulClickedIds, setHelpfulClickedIds] = useState<Record<string, boolean>>({});

  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === 'Delivered'),
    [orders]
  );

  useEffect(() => {
    if (preselectedOrderId) {
      setSelectedOrderId(preselectedOrderId);
      onClearPreselectedOrder();
    }
  }, [preselectedOrderId, onClearPreselectedOrder]);

  const metrics = useMemo(() => {
    if (reviews.length === 0) {
      return {
        avgRating: 0,
        avgPunctuality: 0,
        avgQuality: 0,
        avgValue: 0,
        recommendPct: 0,
        verifiedOrderCount: 0,
      };
    }
    const count = reviews.length;
    return {
      avgRating: reviews.reduce((s, r) => s + r.rating, 0) / count,
      avgPunctuality: reviews.reduce((s, r) => s + r.punctualityRating, 0) / count,
      avgQuality: reviews.reduce((s, r) => s + r.qualityRating, 0) / count,
      avgValue: reviews.reduce((s, r) => s + r.valueRating, 0) / count,
      recommendPct: Math.round(
        (reviews.filter((r) => r.wouldRecommend).length / count) * 100
      ),
      verifiedOrderCount: reviews.filter((r) => r.verifiedOrder).length,
    };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    const filtered = reviews.filter((r) => {
      if (filter === '5star') return r.rating === 5;
      if (filter === 'verified-order') return r.verifiedOrder;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === 'highest') return b.rating - a.rating;
      if (sortBy === 'helpful') return b.helpfulCount - a.helpfulCount;
      return 0;
    });
  }, [reviews, filter, sortBy]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!userUid) {
      onRequireAuth('signup');
      return;
    }
    if (!emailVerified) {
      setErrorMsg(
        'Only verified accounts can publish reviews. Please verify your email or sign in with Google.'
      );
      return;
    }

    const cleanComment = sanitizeText(comment, BLUEPRINT_LIMITS.reviewCommentMax);
    if (cleanComment.length < BLUEPRINT_LIMITS.reviewCommentMin) {
      setErrorMsg('Please write at least 10 characters describing your CampusFin experience.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingReviewId) {
        await updateDoc(doc(db, 'reviews', editingReviewId), {
          rating,
          punctualityRating,
          qualityRating,
          valueRating,
          comment: cleanComment,
          wouldRecommend,
          updatedAt: serverTimestamp(),
        });
        setEditingReviewId(null);
      } else {
        const reviewId = generateSafeId('rev');
        const matchedOrder = deliveredOrders.find((o) => o.id === selectedOrderId);
        const authorName = sanitizeText(
          profile?.displayName || 'DGU Student',
          BLUEPRINT_LIMITS.displayNameMax
        );
        const authorProgram = sanitizeText(
          profile?.program || 'MBA Year 1 · DGU',
          BLUEPRINT_LIMITS.programMax
        );
        const hostelBlock = sanitizeText(
          matchedOrder?.hostelBlock || profile?.hostelBlock || HOSTEL_BLOCKS[0],
          BLUEPRINT_LIMITS.hostelBlockMax
        );

        await setDoc(doc(db, 'reviews', reviewId), {
          userId: userUid,
          authorName,
          authorProgram,
          hostelBlock,
          rating,
          punctualityRating,
          qualityRating,
          valueRating,
          comment: cleanComment,
          wouldRecommend,
          verifiedAccount: true,
          verifiedOrder: Boolean(matchedOrder),
          orderId: matchedOrder ? matchedOrder.id : '',
          helpfulCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setComment('');
      setSelectedOrderId('');
      setRating(5);
      setPunctualityRating(5);
      setQualityRating(5);
      setValueRating(5);
      setWouldRecommend(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'reviews');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHelpful = async (rev: VerifiedReview) => {
    if (!userUid) {
      onRequireAuth('login');
      return;
    }
    if (!emailVerified || helpfulClickedIds[rev.id]) return;

    setHelpfulClickedIds((prev) => ({ ...prev, [rev.id]: true }));
    try {
      await updateDoc(doc(db, 'reviews', rev.id), {
        helpfulCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setHelpfulClickedIds((prev) => ({ ...prev, [rev.id]: false }));
      handleFirestoreError(err, OperationType.UPDATE, `reviews/${rev.id}`);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reviews/${reviewId}`);
    }
  };

  const startEditReview = (rev: VerifiedReview) => {
    setEditingReviewId(rev.id);
    setRating(rev.rating);
    setPunctualityRating(rev.punctualityRating);
    setQualityRating(rev.qualityRating);
    setValueRating(rev.valueRating);
    setWouldRecommend(rev.wouldRecommend);
    setComment(rev.comment);
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Verified Student Feedback · 80% Satisfaction Target
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            Verified Reviews &amp; Ratings
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Only email-verified CampusFin accounts can submit ratings. Reviews linked to a delivered order carry Verified Pickup Order confirmation.
          </p>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Overall Rating
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {reviews.length > 0 ? metrics.avgRating.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              / 5.0 ({reviews.length} reviews)
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Would Recommend
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
            {reviews.length > 0 ? `${metrics.recommendPct}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pilot target: ≥ 80%
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Punctuality / Quality
          </span>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {reviews.length > 0
              ? `${metrics.avgPunctuality.toFixed(1)} · ${metrics.avgQuality.toFixed(1)}`
              : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            On-time pickup &amp; steam press
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Verified Pickup Reviews
          </span>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {metrics.verifiedOrderCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Linked to delivered orders
          </p>
        </div>
      </div>

      {/* Split: Review Submission (Left 5 cols) + Reviews Feed (Right 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {editingReviewId ? 'Edit Your Verified Review' : 'Submit Verified Review'}
            </h2>
            <MessageSquarePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>

          {!userUid ? (
            <div className="space-y-3 py-2">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                To keep ratings authentic for DGU students, only verified signed-in users can submit a review.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRequireAuth('login')}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => onRequireAuth('signup')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  Sign Up to Review
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitReview} className="space-y-4">
              {!editingReviewId && deliveredOrders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Link Delivered Laundry Order (Optional)
                  </label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Verified Account Review (No order attached)</option>
                    {deliveredOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.batchCode} · {o.pickupDate} · {o.serviceType}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <StarPicker label="Overall Satisfaction" value={rating} onChange={setRating} />
                <StarPicker
                  label="Pickup & Delivery Punctuality"
                  value={punctualityRating}
                  onChange={setPunctualityRating}
                />
                <StarPicker
                  label="Wash & Steam Iron Quality"
                  value={qualityRating}
                  onChange={setQualityRating}
                />
                <StarPicker
                  label="Value for ₹150 Student Price"
                  value={valueRating}
                  onChange={setValueRating}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Would recommend to hostel peers?
                </span>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setWouldRecommend(true)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      wouldRecommend
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWouldRecommend(false)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      !wouldRecommend
                        ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Your Review ({comment.length}/{BLUEPRINT_LIMITS.reviewCommentMax})
                </label>
                <textarea
                  required
                  rows={4}
                  minLength={BLUEPRINT_LIMITS.reviewCommentMin}
                  maxLength={BLUEPRINT_LIMITS.reviewCommentMax}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share feedback on pickup timing, wash quality, ironing, and value..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg p-2.5"
                >
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting || !emailVerified}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Publishing...'
                    : editingReviewId
                      ? 'Save Updated Review'
                      : 'Publish Verified Review'}
                </button>
                {editingReviewId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReviewId(null);
                      setComment('');
                    }}
                    className="px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        {/* Right Feed */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
              {(
                [
                  ['all', 'All Reviews'],
                  ['5star', '5 Stars'],
                  ['verified-order', 'Verified Orders'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    filter === key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ReviewSort)}
              aria-label="Sort reviews"
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="recent">Most Recent</option>
              <option value="highest">Highest Rated</option>
              <option value="helpful">Most Helpful</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : visibleReviews.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No verified reviews match this filter yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verified CampusFin users can submit ratings and feedback using the form on the left.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleReviews.map((rev) => {
                const isOwn = userUid === rev.userId;
                return (
                  <article
                    key={rev.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {rev.authorName}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <BadgeCheck className="w-3.5 h-3.5" />
                            {rev.verifiedOrder ? 'Verified Pickup Order' : 'Verified Account'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {rev.authorProgram} · {rev.hostelBlock}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                        <span>{rev.rating.toFixed(1)}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {rev.comment}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                        <span>Punctuality {rev.punctualityRating}/5</span>
                        <span aria-hidden="true">·</span>
                        <span>Quality {rev.qualityRating}/5</span>
                        <span aria-hidden="true">·</span>
                        <span>Value {rev.valueRating}/5</span>
                        <span aria-hidden="true">·</span>
                        <span>{rev.wouldRecommend ? 'Recommends' : 'Needs improvement'}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleHelpful(rev)}
                          disabled={Boolean(helpfulClickedIds[rev.id])}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-60"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span className="font-mono tabular-nums">
                            Helpful ({rev.helpfulCount})
                          </span>
                        </button>

                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => startEditReview(rev)}
                            aria-label="Edit your review"
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(isOwn || isAdmin) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev.id)}
                            aria-label="Delete review"
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
