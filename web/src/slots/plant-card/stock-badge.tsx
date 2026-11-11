import { StockBadge } from '../../components/StockBadge';
import type { PlantSummary } from '../../types';

export default function StockBadgeSlot({ plant }: { plant: PlantSummary }) {
  return <StockBadge stock={plant.stock} />;
}
