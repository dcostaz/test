module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'script', // CommonJS uses script mode
    project: './tsconfig.json', // needed for type-aware rules
  },
  env: {
    node: true,
    es2021: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking', // for type-aware rules
  ],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error', // ← catches un-awaited async calls
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
  },
};
