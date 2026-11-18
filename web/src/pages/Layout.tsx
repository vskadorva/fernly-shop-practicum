import { Link, NavLink, Outlet } from 'react-router';
import { useCart } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { HelperWidget } from '../components/HelperWidget';
import styles from './Pages.module.css';

export function Layout() {
  const { user, signOut } = useAuth();
  const cart = useCart();
  const count = cart.data?.itemCount ?? 0;

  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span aria-hidden="true">🌿</span> Fernly
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <NavLink to="/" end>
            Shop
          </NavLink>
          {user ? <NavLink to="/orders">Orders</NavLink> : null}
          <NavLink to="/cart" className={styles.cartLink}>
            Cart
            {count > 0 ? (
              <span className={styles.badge}>
                {count}
                <span className="visually-hidden"> {count === 1 ? 'item' : 'items'}</span>
              </span>
            ) : null}
          </NavLink>
          {user ? (
            <span className={styles.account}>
              <span>Hi, {user.name.split(' ')[0]}</span>
              <button type="button" className={styles.linkButton} onClick={signOut}>
                Sign out
              </button>
            </span>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>Fernly is a practice shop for testing. No plants are harmed or shipped.</footer>
      <HelperWidget />
    </div>
  );
}
