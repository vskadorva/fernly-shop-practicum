import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useOrder, useOrders } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/Feedback';
import { OrderSummary } from '../components/OrderSummary';
import { PriceTag } from '../components/PriceTag';
import styles from './Pages.module.css';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

export function OrdersPage() {
  const { user, ready } = useAuth();
  const orders = useOrders();
  if (!ready) return <p className={styles.loading}>Loading…</p>;
  if (!user) return <Navigate to="/login?next=/orders" replace />;
  if (orders.isLoading) return <p className={styles.loading}>Loading your orders…</p>;
  if (orders.isError) return <ErrorBanner message="Your orders couldn't be loaded." onRetry={() => void orders.refetch()} />;
  if (!orders.data?.length) return <EmptyState title="No orders yet" message="Your orders will show up here." />;

  return (
    <div className={styles.orders}>
      <h1>Your orders</h1>
      <ul className={styles.orderList}>
        {orders.data.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`}>Order {order.id}</Link>
            <span>{date(order.createdAt)}</span>
            <span>{order.lines.length} {order.lines.length === 1 ? 'line' : 'lines'}</span>
            <PriceTag amount={order.total} label="Total" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderPage() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const { user, ready } = useAuth();
  const order = useOrder(orderId);
  if (!ready) return <p className={styles.loading}>Loading…</p>;
  if (!user) return <Navigate to={`/login?next=/orders/${orderId}`} replace />;
  if (order.isLoading) return <p className={styles.loading}>Loading order…</p>;
  if (order.isError) {
    return order.error instanceof ApiRequestError && order.error.status === 404 ? (
      <EmptyState title="Order not found" action={<Link to="/orders">Back to your orders</Link>} />
    ) : (
      <ErrorBanner message="The order couldn't be loaded." onRetry={() => void order.refetch()} />
    );
  }
  const data = order.data;
  if (!data) return null;
  const itemCount = data.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className={styles.orders}>
      {params.get('placed') ? (
        <div className={styles.thanks} role="status">
          Thank you! Your order is placed.
        </div>
      ) : null}
      <h1>Order {data.id}</h1>
      <p className={styles.latin}>
        Placed {date(data.createdAt)} · Ships to {data.shippingAddress.fullName}, {data.shippingAddress.city}
      </p>
      <div className={styles.cartLayout}>
        <ul className={styles.orderLines}>
          {data.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.quantity} × {line.name} (size {line.size})
              </span>
              <PriceTag amount={line.lineTotal} label="Line total" />
            </li>
          ))}
        </ul>
        <OrderSummary
          title="Paid"
          itemCount={itemCount}
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
