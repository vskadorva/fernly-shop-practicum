import { plugin as cypressGrepPlugin } from '@cypress/grep/plugin';
import { defineConfig } from 'cypress';

export default defineConfig({
  video: false,
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
    specPattern: 'cypress/component/**/*.cy.tsx',
    supportFile: 'cypress/support/component.tsx',
    setupNodeEvents(on, config) {
      cypressGrepPlugin(config);
      return config;
    },
  },
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/ui/**/*.cy.ts',
    supportFile: 'cypress/support/ui.ts',
    setupNodeEvents(on, config) {
      cypressGrepPlugin(config);
      return config;
    },
  },
});
