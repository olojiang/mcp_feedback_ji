/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // The extension integrates with dynamic VS Code and JSON payloads at its
    // boundaries. Keep those deliberate escape hatches visible without making
    // the existing codebase fail lint solely for using them.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      ignoreRestSiblings: true,
    }],
    // Empty catches are used for optional platform capabilities where failure
    // intentionally falls back to the remaining providers.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
