import { formatPrice } from '../money';
import { PriceTag } from './PriceTag';
import styles from './OrderSummary.module.css';

export const FREE_SHIPPING_FROM = 50;

interface OrderSummaryProps {
  itemCount: number;
  subtotal: number;
  shipping: number;
  total: number;
  discount?: number;
  promoCode?: string | null;
  title?: string;
}

export function OrderSummary({ itemCount, subtotal, shipping, total, discount = 0, promoCode = null, title = 'Order summary' }: OrderSummaryProps) {
  const missing = Math.round((FREE_SHIPPING_FROM - subtotal) * 100) / 100;
  return (
    <section className={styles.summary} aria-labelledby="order-summary-title">
      <h2 id="order-summary-title" className={styles.title}>
        {title}
      </h2>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>
            Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </dt>
          <dd>
            <PriceTag amount={subtotal} />
          </dd>
        </div>
        {discount > 0 ? (
          <div className={styles.row}>
            <dt>Discount{promoCode ? ` (${promoCode})` : ''}</dt>
            <dd className={styles.discount}>−{formatPrice(discount)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>Shipping</dt>
          <dd>{shipping === 0 && itemCount > 0 ? <strong className={styles.free}>Free</strong> : <PriceTag amount={shipping} />}</dd>
        </div>
        <div className={`${styles.row} ${styles.total}`}>
          <dt>Total</dt>
          <dd>
            <PriceTag amount={total} size="lg" />
          </dd>
        </div>
      </dl>
      {itemCount > 0 && missing > 0 ? (
        <p className={styles.hint}>Add {formatPrice(missing)} more for free shipping.</p>
      ) : null}
    </section>
  );
}
