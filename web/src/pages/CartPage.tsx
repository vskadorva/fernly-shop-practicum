import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useCart, useRemoveLine, useUpdateLine } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { CartLine } from '../components/CartLine';
import { EmptyState, ErrorBanner, Toast } from '../components/Feedback';
import { OrderSummary } from '../components/OrderSummary';
import { CartSummarySlot } from '../slots/Slot';
import styles from './Pages.module.css';

export function CartPage() {
  const { user, ready } = useAuth();
  const cart = useCart();
  const updateLine = useUpdateLine();
  const removeLine = useRemoveLine();
  const [toast, setToast] = useState<string | null>(null);

  if (!ready) return <p className={styles.loading}>Loading…</p>;
  if (!user) return <Navigate to="/login?next=/cart" replace />;
  if (cart.isLoading) return <p className={styles.loading}>Loading your cart…</p>;
  if (cart.isError) return <ErrorBanner message="Your cart couldn't be loaded." onRetry={() => void cart.refetch()} />;
  const data = cart.data;
  if (!data || data.lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Plants you add will show up here."
        action={
          <Link to="/" className={styles.primaryLink}>
            Browse plants
          </Link>
        }
      />
    );
  }

  const busy = updateLine.isPending || removeLine.isPending;
  const onError = (error: Error) => setToast(error.message);

  return (
    <div className={styles.cart}>
      <h1>Your cart</h1>
      <div className={styles.cartLayout}>
        <ul className={styles.lines}>
          {data.lines.map((line) => (
            <CartLine
              key={line.id}
              line={line}
              busy={busy}
              onQuantityChange={(lineId, quantity) => updateLine.mutate({ lineId, quantity }, { onError })}
              onRemove={(lineId) => removeLine.mutate(lineId, { onError })}
            />
          ))}
        </ul>
        <div className={styles.side}>
          <OrderSummary
            itemCount={data.itemCount}
            subtotal={data.subtotal}
            discount={data.discount}
            promoCode={data.promoCode}
            shipping={data.shipping}
            total={data.total}
          />
          <CartSummarySlot cart={data} />
          <Link to="/checkout" className={styles.primaryLink}>
            Go to checkout
          </Link>
        </div>
      </div>
      {toast ? <Toast message={toast} tone="error" onClose={() => setToast(null)} /> : null}
    </div>
  );
}
