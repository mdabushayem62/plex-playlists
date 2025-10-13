import tseslint from 'typescript-eslint';
import eslintPluginImport from 'eslint-plugin-import';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['src/test-*.ts', 'src/TEST-*.md']
  },
  {
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
  }
);
