import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Lets the verification scripts import application modules exactly as the application
 * writes them: `@/lib/thing` and extensionless relative paths, which Next resolves and
 * Node does not.
 *
 * Load with `node --experimental-strip-types --import ./scripts/ts-path-resolver.mjs`.
 * Without it a tested module may not import anything at all, which is a constraint on
 * the source rather than on the test.
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.mts', '/index.ts'];

function candidateFor(specifier, parentURL) {
  if (specifier.startsWith('@/')) return resolve(projectRoot, specifier.slice(2));
  if (specifier.startsWith('.') && parentURL) return resolve(dirname(fileURLToPath(parentURL)), specifier);
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const base = candidateFor(specifier, context.parentURL);
      if (!base) throw error;
      for (const extension of EXTENSIONS) {
        if (existsSync(base + extension)) {
          return { url: pathToFileURL(base + extension).href, shortCircuit: true };
        }
      }
      throw error;
    }
  },
});
