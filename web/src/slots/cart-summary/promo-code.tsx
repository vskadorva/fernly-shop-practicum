import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { PromoCodeInput } from '../../components/PromoCodeInput';
import type { Cart } from '../../types';

export default function PromoCodeSlot({ cart }: { cart: Cart }) {
  const queryClient = useQueryClient();
  const apply = useMutation({
    mutationFn: (code: string) => apiFetch<Cart>('/cart/promo', { method: 'POST', body: { code } }),
    onSuccess: (next) => queryClient.setQueryData(['cart'], next),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch<Cart>('/cart/promo', { method: 'DELETE' }),
    onSuccess: (next) => queryClient.setQueryData(['cart'], next),
  });

  return (
    <PromoCodeInput
      appliedCode={cart.promoCode}
      busy={apply.isPending || remove.isPending}
      error={apply.error?.message ?? null}
      onApply={(code) => apply.mutate(code)}
      onRemove={() => {
        apply.reset();
        remove.mutate();
      }}
    />
  );
}
