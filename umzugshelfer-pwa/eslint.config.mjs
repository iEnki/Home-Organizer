import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default [
  { ignores: ['build/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
    plugins: { 'react-hooks': hooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      // Keep the accepted CRA baseline; these newer recommendations are a separate cleanup.
      'no-useless-assignment': 'off',
      'no-constant-binary-expression': 'off',
      'preserve-caught-error': 'off',
      'no-extra-boolean-cast': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
