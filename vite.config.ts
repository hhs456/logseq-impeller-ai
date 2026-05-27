import { defineConfig } from 'vite';

export default defineConfig({
  // 必須設定為相對路徑，否則打包後打包檔會試圖從根目錄 / 載入
  base: './', 
  build: {
    target: 'esnext',
    minify: 'terser', // 或者 'esbuild'
    outDir: 'dist',
    rollupOptions: {
      input: {
        // 確保 Vite 把你的 index.html 當作打包進入點
        main: './index.html', 
      },
    },
  },
});