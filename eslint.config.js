// eslint.config.js — flat config (ESLint 9).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    // `android/` es el proyecto nativo generado/gestionado por Capacitor + Gradle.
    // Contiene assets web copiados y artefactos de build que no forman parte del
    // código fuente TS/React y se validan con la toolchain Android, no con ESLint.
    ignores: ['dist', 'coverage', 'node_modules', 'android/**', 'src/data/*.json'],
  },
  {
    // App React/TypeScript (src/).
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts y tests de Node (tooling de integridad de contenido, Fase 1.5/1.5B).
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Scripts de aceptación manual de la Fase 4 (PWA offline): son
    // scripts de Node (orquestan un build + un servidor + Playwright),
    // pero el cuerpo de los `page.evaluate(...)` se ejecuta DENTRO del
    // navegador controlado por Playwright, no en el proceso Node — de
    // ahí que necesiten también los globals de navegador
    // (indexedDB/document/navigator/...) además de los de Node.
    files: ['scripts/pwa-*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
