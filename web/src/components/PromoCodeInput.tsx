import { useState, type FormEvent } from 'react';
import styles from './PromoCodeInput.module.css';

interface PromoCodeInputProps {
  appliedCode: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  error?: string | null;
  busy?: boolean;
}

export function PromoCodeInput({ appliedCode, onApply, onRemove, error = null, busy = false }: PromoCodeInputProps) {
  const [code, setCode] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) onApply(code.trim());
  }

  if (appliedCode) {
    return (
      <div className={styles.applied}>
        <span>
          Code <strong>{appliedCode}</strong> applied
        </span>
        <button type="button" className={styles.link} disabled={busy} onClick={onRemove}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <form className={styles.box} onSubmit={submit}>
      <p className={styles.title}>Have a promo code?</p>
      <div className={styles.row}>
        <input className={styles.input} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
        <button type="submit" className={styles.apply} disabled={busy || !code.trim()}>
          Apply
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
