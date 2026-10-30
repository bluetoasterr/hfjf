import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { rollup } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import swc from '@swc/core';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const bundle = await rollup({
  // Never compile the already-generated root index.js on the second build.
  input: 'src/index.ts',
  external: id => id.startsWith('@vendetta/') || id === 'react' || id === 'react-native',
  plugins: [nodeResolve(), commonjs(), {
    name: 'swc',
    async transform(code, id) {
      if (!/\.(tsx?|jsx?)$/.test(id)) return null;
      const ts = /\.tsx?$/.test(id);
      const result = await swc.transform(code, {
        filename: id,
        jsc: { parser: { syntax: ts ? 'typescript' : 'ecmascript', tsx: id.endsWith('.tsx'), jsx: id.endsWith('.jsx') },
          transform: { react: { runtime: 'classic' } }, target: 'es2020' }
      });
      return result.code;
    }
  }, esbuild({ minify: true })]
});
await mkdir('dist', { recursive: true });
await bundle.write({
  file: 'dist/index.js', format: 'iife', exports: 'named',
  globals: id => id.startsWith('@vendetta/') ? id.slice(1).replaceAll('/', '.')
    : id === 'react' ? 'window.React' : id === 'react-native' ? 'window.ReactNative' : id
});
await bundle.close();
const js = await readFile('dist/index.js');
manifest.main = 'index.js';
manifest.hash = createHash('sha256').update(js).digest('hex');
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Built global role style,', js.length, 'bytes');
