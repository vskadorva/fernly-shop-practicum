import styles from './Reviews.module.css';

export interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
}

interface ReviewListProps {
  reviews: ReviewItem[];
  average: number;
  count: number;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

export function ReviewList({ reviews, average, count }: ReviewListProps) {
  if (count === 0) return <p className={styles.none}>No reviews yet. Be the first to share how it's growing.</p>;
  return (
    <>
      <p className={styles.average}>
        <span aria-hidden="true">★</span> {average.toFixed(1)} out of 5 · {count} {count === 1 ? 'review' : 'reviews'}
      </p>
      <ul className={styles.list}>
        {reviews.map((review) => (
          <li key={review.id} className={styles.item}>
            <div className={styles.head}>
              <strong>{review.author}</strong>
              <span className={styles.rating}>
                <span aria-hidden="true">{'★'.repeat(review.rating)}</span>
                <span className="visually-hidden">{review.rating} out of 5</span>
              </span>
              <span className={styles.date}>{date(review.createdAt)}</span>
            </div>
            <p className={styles.text}>{review.text}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
