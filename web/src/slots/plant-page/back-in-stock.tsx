import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { NotifyForm } from '../../components/NotifyForm';
import type { Plant } from '../../types';

export default function BackInStockSlot({ plant }: { plant: Plant }) {
  const notify = useMutation({
    mutationFn: (email: string) => apiFetch<{ status: string; email: string }>(`/plants/${plant.id}/notify`, { method: 'POST', body: { email } }),
  });
  if (plant.stock > 0) return null;
  return (
    <NotifyForm
      plantName={plant.name}
      busy={notify.isPending}
      error={notify.error?.message ?? null}
      subscribedEmail={notify.data?.email ?? null}
      onSubmit={(email) => notify.mutate(email)}
    />
  );
}
