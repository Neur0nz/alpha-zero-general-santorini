import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname);
  const env = loadEnv(mode, envDir, '');

  return {
    plugins: [react()],
    envDir,
    base: env.VITE_PUBLIC_BASE_PATH ?? '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@theme': path.resolve(__dirname, 'src/theme'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
        '@game': path.resolve(__dirname, 'src/game')
      }
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 5173),
      host: true
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT ?? 4173),
      host: true
    },
    build: {
      outDir: path.resolve(__dirname, '../dist'),
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: mode === 'development',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', '@chakra-ui/react', '@chakra-ui/icons', 'framer-motion']
          }
        }
      }
    }
  };
});
