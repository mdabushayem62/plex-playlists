/**
 * Compile TSX views to JS for production Docker image
 * Uses esbuild to compile with @kitajs/html JSX transform
 * Then rewrites import paths from .tsx to .js
 */

import { build } from 'esbuild';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function findTsxFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function findCompiledJsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findCompiledJsFiles(fullPath));
    } else if (entry.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function rewriteImports(jsFiles: string[]): void {
  console.log('🔄 Rewriting import paths (.tsx → .js)...');

  let totalRewrites = 0;

  for (const filePath of jsFiles) {
    const content = readFileSync(filePath, 'utf-8');

    // Rewrite import statements: './foo.tsx' → './foo.js'
    // Handles both single and double quotes, and various import formats
    const rewritten = content
      .replace(/from\s+['"](.+?)\.tsx['"]/g, (match, path) => {
        totalRewrites++;
        return `from '${path}.js'`;
      })
      .replace(/import\s*\(\s*['"](.+?)\.tsx['"]\s*\)/g, (match, path) => {
        totalRewrites++;
        return `import('${path}.js')`;
      });

    if (content !== rewritten) {
      writeFileSync(filePath, rewritten, 'utf-8');
    }
  }

  console.log(`   → Rewrote ${totalRewrites} import statements`);
}

async function compileViews() {
  console.log('🔨 Compiling TSX views to JS...');

  const viewFiles = findTsxFiles('src/web/views');

  if (viewFiles.length === 0) {
    console.log('⚠️  No view files found');
    return;
  }

  console.log(`📁 Found ${viewFiles.length} view files`);

  // Step 1: Compile TSX to JS
  await build({
    entryPoints: viewFiles,
    outdir: 'src/web/views',
    outExtension: { '.js': '.js' },
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    jsx: 'transform',
    jsxFactory: 'Html.createElement',
    jsxFragment: 'Html.Fragment',
    bundle: false, // Don't bundle imports
    minify: false, // Keep readable for debugging
    sourcemap: false,
    logLevel: 'info',
  });

  // Step 2: Find all compiled JS files
  const jsFiles = findCompiledJsFiles('src/web/views');
  console.log(`📝 Found ${jsFiles.length} compiled JS files`);

  // Step 3: Rewrite import paths
  rewriteImports(jsFiles);

  console.log('✅ Views compiled and imports rewritten successfully!');
}

compileViews().catch((error) => {
  console.error('❌ Failed to compile views:', error);
  process.exit(1);
});
