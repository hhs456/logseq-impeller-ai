import { defineConfig } from 'vite';

export default defineConfig({
  // 必須設定為相對路徑，否則打包後打包檔會試圖從根目錄 / 載入
  base: './', 
  
  // 👇 新增：告訴 Vite 不要預先編譯 Transformers.js，避開 Node 核心模組報錯
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  },

  build: {
    target: 'esnext',
    minify: 'terser', // 或者 'esbuild'
    outDir: 'dist',
    rollupOptions: {
      input: {
        // 確保 Vite 把你的 index.html 當作打包進入點
        main: './index.html', 
      },
      // 👇 新增：強制排除 Node 內建模組，讓模型能順利在純網頁前端環境載入
      external: ['fs', 'path', 'url']
    },
  },
});