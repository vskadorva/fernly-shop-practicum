import '@testing-library/cypress/add-commands';
import { register as registerCypressGrep } from '@cypress/grep';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mount, type MountOptions, type MountReturn } from 'cypress/react';
import type { ReactNode } from 'react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router';
import '../../src/styles/global.css';

registerCypressGrep();

interface FernlyMountOptions extends MountOptions {
  initialEntries?: MemoryRouterProps['initialEntries'];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Mounts a component inside a MemoryRouter and a fresh QueryClientProvider (retries off). */
      mount(component: ReactNode, options?: FernlyMountOptions): Chainable<MountReturn>;
    }
  }
}

Cypress.Commands.add('mount', (component: ReactNode, options: FernlyMountOptions = {}) => {
  const { initialEntries = ['/'], ...mountOptions } = options;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{component}</MemoryRouter>
    </QueryClientProvider>,
    mountOptions,
  );
});
