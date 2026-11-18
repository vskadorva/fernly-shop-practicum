import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useCart, usePlaceOrder } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/Feedback';
import { OrderSummary } from '../components/OrderSummary';
import type { ShippingAddress } from '../types';
import styles from './Pages.module.css';

const FIELDS: { name: keyof ShippingAddress; label: string; autoComplete: string }[] = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'address', label: 'Street address', autoComplete: 'street-address' },
  { name: 'city', label: 'City', autoComplete: 'address-level2' },
  { name: 'postalCode', label: 'Postal code', autoComplete: 'postal-code' },
];

export function CheckoutPage() {
  const { user, ready } = useAuth();
  const cart = useCart();
  const placeOrder = usePlaceOrder();
  const navigate = useNavigate();
  const [address, setAddress] = useState<ShippingAddress>({ fullName: '', address: '', city: '', postalCode: '' });

  if (!ready) return <p className={styles.loading}>Loading…</p>;
  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (cart.isLoading) return <p className={styles.loading}>Loading your cart…</p>;
  if (cart.isError) return <ErrorBanner message="Your cart couldn't be loaded." onRetry={() => void cart.refetch()} />;
  const data = cart.data;
  if (!data || data.lines.length === 0) return <EmptyState title="Your cart is empty" message="Add a plant before you check out." />;

  function submit(event: FormEvent) {
    event.preventDefault();
    placeOrder.mutate(address, { onSuccess: (order) => navigate(`/orders/${order.id}?placed=1`) });
  }

  return (
    <div className={styles.checkout}>
      <h1>Checkout</h1>
      <div className={styles.cartLayout}>
        <form className={styles.form} onSubmit={submit} noValidate>
          <h2>Shipping address</h2>
          {placeOrder.isError ? <ErrorBanner message={placeOrder.error.message} /> : null}
          {FIELDS.map((field) => (
            <div key={field.name} className={styles.field}>
              <label htmlFor={`checkout-${field.name}`}>{field.label}</label>
              <input
                id={`checkout-${field.name}`}
                name={field.name}
                autoComplete={field.autoComplete}
                required
                value={address[field.name]}
                onChange={(event) => setAddress({ ...address, [field.name]: event.target.value })}
              />
            </div>
          ))}
          <button type="submit" className={styles.primary} disabled={placeOrder.isPending}>
            {placeOrder.isPending ? 'Placing order…' : 'Place order'}
          </button>
        </form>
        <OrderSummary
          itemCount={data.itemCount}
          subtotal={data.subtotal}
          discount={data.discount}
          promoCode={data.promoCode}
          shipping={data.shipping}
          total={data.total}
        />
      </div>
    </div>
  );
}
