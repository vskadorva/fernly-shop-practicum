import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { PopularList, type PopularItem } from '../../components/PopularList';
import type { Plant } from '../../types';

export default function PopularSlot({ plant }: { plant: Plant }) {
  const popular = useQuery({
    queryKey: ['popular'],
    queryFn: () => apiFetch<{ days: number; items: PopularItem[] }>('/popular?limit=5'),
  });
  if (!popular.data) return null;
  return <PopularList items={popular.data.items} currentId={plant.id} />;
}
