import tseslint from 'typescript-eslint';
import eslintPluginImport from 'eslint-plugin-import';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config({
  extends: [
    ...tseslint.configs.recommended,
    eslintConfigPrettier
  ],
  plugins: {
    import: eslintPluginImport
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json'
      }
    }
  },
  rules: {
    'import/no-unresolved': 'error'
  },
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json'
    }
  }
});
