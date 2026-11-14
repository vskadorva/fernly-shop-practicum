import { Link } from 'react-router';
import styles from './PopularList.module.css';

export interface PopularItem {
  id: string;
  name: string;
  unitsSold: number;
}

interface PopularListProps {
  items: PopularItem[];
  currentId?: string;
}

/** "Popular right now": up to four plant links, most sold first, leaving out the plant on screen. */
export function PopularList({ items, currentId }: PopularListProps) {
  const shown = items.filter((item) => item.id !== currentId).slice(0, 4);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="popular-title" className={styles.popular}>
      <h2 id="popular-title">Popular right now</h2>
      <ol>
        {shown.map((item) => (
          <li key={item.id}>
            <Link to={`/plants/${item.id}`}>{item.name}</Link>
            <span className={styles.sold}>{item.unitsSold} sold this month</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
