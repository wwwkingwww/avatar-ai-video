/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-console': 'off',
    'no-debugger': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-var': 'error',
    'prefer-const': 'error',
    'eqeqeq': ['error', 'always']
  },
  ignorePatterns: ['node_modules/', '*.config.*']
};
