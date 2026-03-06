import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    base: './',
    plugins: [
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            overrides: {
                crypto: 'crypto-browserify',
            },
        }),
        react(),
    ],
    resolve: {
        alias: {
            global: 'global',
            undici: resolve(__dirname, 'node_modules/opnet/src/fetch/fetch-browser.js'),
        },
        mainFields: ['module', 'main', 'browser'],
        dedupe: ['@noble/curves', '@noble/hashes', '@scure/base', 'buffer', 'react', 'react-dom'],
    },
    build: {
        commonjsOptions: {
            strictRequires: true,
            transformMixedEsModules: true,
        },
        rollupOptions: {
            external: [
                'worker_threads',
                'node:sqlite',
                'node:diagnostics_channel',
                'node:async_hooks',
                'node:perf_hooks',
                'node:worker_threads',
            ],
        },
        target: 'esnext',
        modulePreload: false,
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'buffer', 'process', 'stream-browserify'],
        exclude: ['@btc-vision/transaction', 'crypto-browserify'],
    },
});
