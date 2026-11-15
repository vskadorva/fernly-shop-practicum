import styles from './StockBadge.module.css';

/** Warns when only a few plants are left. */
export function StockBadge({ stock }: { stock: number }) {
  if (stock > 3) return null;
  return <span className={styles.badge}>Only {stock} left</span>;
}
