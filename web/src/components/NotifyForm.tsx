import { useState, type FormEvent } from 'react';
import styles from './NotifyForm.module.css';

interface NotifyFormProps {
  plantName: string;
  onSubmit: (email: string) => void;
  busy?: boolean;
  error?: string | null;
  subscribedEmail?: string | null;
}

export function NotifyForm({ plantName, onSubmit, busy = false, error = null, subscribedEmail = null }: NotifyFormProps) {
  const [email, setEmail] = useState('');

  if (subscribedEmail) {
    return (
      <p className={styles.done} role="status">
        We'll email {subscribedEmail} when {plantName} is back.
      </p>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(email.trim());
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor="notify-email" className={styles.label}>
        Email me when it's back
      </label>
      <div className={styles.row}>
        <input id="notify-email" type="email" autoComplete="email" className={styles.input} value={email} onChange={(event) => setEmail(event.target.value)} />
        <button type="submit" className={styles.button} disabled={busy || !email.trim()}>
          Notify me
        </button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
