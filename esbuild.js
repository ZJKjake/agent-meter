const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const configurations = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  },
  {
    entryPoints: ['src/infrastructure/claude/claudeStatuslineBridge.ts'],
    outfile: 'dist/claude-statusline-bridge.js',
    external: [],
  },
].map((configuration) => ({
  ...configuration,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  logLevel: 'info',
}));

async function build() {
  const buildContexts = await Promise.all(
    configurations.map((configuration) => esbuild.context(configuration)),
  );

  if (watch) {
    await Promise.all(buildContexts.map((buildContext) => buildContext.watch()));
    console.log('Watching for changes...');
    return;
  }

  await Promise.all(buildContexts.map((buildContext) => buildContext.rebuild()));
  await Promise.all(buildContexts.map((buildContext) => buildContext.dispose()));
}

build().catch(() => process.exit(1));
