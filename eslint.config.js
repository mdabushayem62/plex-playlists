import tseslint from 'typescript-eslint';
import eslintPluginImport from 'eslint-plugin-import';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['src/test-*.ts', 'src/TEST-*.md']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'import/no-unresolved': 'error'
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json'
      }
    }
  }
);
