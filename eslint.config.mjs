import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '.tools/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
]
