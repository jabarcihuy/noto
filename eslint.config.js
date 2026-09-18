const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'node_modules/*'],
    rules: {
      // TypeScript already validates module resolution, including tsconfig path aliases.
      // The bundled eslint-plugin-import resolver is incompatible with this toolchain.
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
      'import/export': 'off',
    },
  },
]);
