import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // These packages bundle their own WASM / Web Workers internally.
    // Letting Vite re-bundle them produces enormous pre-bundled files that
    // freeze Firefox on page load and crash the Windows file-dialog.
    // Excluding them means the packages are served as-is, on demand.
    exclude: [
      '@huggingface/transformers',
      'pdfjs-dist',
    ],
  },
});
