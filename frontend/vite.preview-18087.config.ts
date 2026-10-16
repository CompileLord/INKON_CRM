import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
      "http://127.0.0.1:18087/api/v1"
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 5196,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:18087",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5196,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:18087",
        changeOrigin: true,
      },
    },
  },
});
