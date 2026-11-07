import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBanner, Toast } from '../../components/Feedback';
import { ReviewForm } from '../../components/ReviewForm';
import { ReviewList, type ReviewItem } from '../../components/ReviewList';
import styles from '../../components/Reviews.module.css';
import type { Plant } from '../../types';

interface ReviewListResponse {
  plantId: string;
  average: number;
  count: number;
  reviews: ReviewItem[];
}

export default function ReviewsSlot({ plant }: { plant: Plant }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [thanks, setThanks] = useState(false);
  const reviews = useQuery({
    queryKey: ['reviews', plant.id],
    queryFn: () => apiFetch<ReviewListResponse>(`/plants/${plant.id}/reviews`),
  });
  const post = useMutation({
    mutationFn: (review: { rating: number; text: string }) => apiFetch<ReviewItem>(`/plants/${plant.id}/reviews`, { method: 'POST', body: review }),
    onSuccess: () => {
      setThanks(true);
      void queryClient.invalidateQueries({ queryKey: ['review', plant.id] });
    },
  });

  return (
    <section className={styles.section} aria-labelledby="reviews-title">
      <h2 id="reviews-title">Reviews</h2>
      {reviews.isLoading ? <p className={styles.none}>Loading reviews…</p> : null}
      {reviews.isError ? <ErrorBanner message="Reviews couldn't be loaded." onRetry={() => void reviews.refetch()} /> : null}
      {reviews.data ? <ReviewList reviews={reviews.data.reviews} average={reviews.data.average} count={reviews.data.count} /> : null}
      {user ? (
        <ReviewForm busy={post.isPending} error={post.error?.message ?? null} onSubmit={(review) => post.mutate(review)} />
      ) : (
        <p className={styles.none}>
          <Link to={`/login?next=/plants/${plant.id}`}>Sign in</Link> to write a review.
        </p>
      )}
      {thanks ? <Toast message="Thanks for your review!" onClose={() => setThanks(false)} /> : null}
    </section>
  );
}
