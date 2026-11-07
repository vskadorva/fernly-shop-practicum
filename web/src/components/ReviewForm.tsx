import { useState, type FormEvent } from 'react';
import { StarRatingInput } from './StarRatingInput';
import styles from './Reviews.module.css';

interface ReviewFormProps {
  onSubmit: (review: { rating: number; text: string }) => void;
  busy?: boolean;
  error?: string | null;
}

export function ReviewForm({ onSubmit, busy = false, error = null }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (rating === 0) return setProblem('Choose a rating from 1 to 5 stars.');
    if (text.trim().length < 10) return setProblem('Write at least 10 characters.');
    setProblem(null);
    onSubmit({ rating, text: text.trim() });
    setRating(0);
    setText('');
  }

  const message = problem ?? error;
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h3 className={styles.formTitle}>Write a review</h3>
      <StarRatingInput value={rating} onChange={setRating} />
      <label htmlFor="review-text" className={styles.label}>
        Your review
      </label>
      <textarea id="review-text" className={styles.textarea} rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
      {message ? (
        <p className={styles.problem} role="alert">
          {message}
        </p>
      ) : null}
      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? 'Posting…' : 'Post review'}
      </button>
    </form>
  );
}
