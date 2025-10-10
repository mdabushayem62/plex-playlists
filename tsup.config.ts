import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  target: 'es2022',
  // Exclude .tsx files from being processed by esbuild
  // They are loaded dynamically at runtime via dynamic imports
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.tsx': 'empty',
    };
  },
  // Don't bundle .tsx files - treat them as external
  external: [/\.tsx$/],
  // Skip node_modules bundling
  noExternal: [],
});
