import { defineConfig, loadEnv } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + "/../..", "");
  const port = parseInt(env.PORT_DASHBOARD || "8081");

  return {
    plugins: [fresh(), tailwindcss()],
    server: {
      port,
      allowedHosts: ["pml.casys.ai", "localhost"],
      // HMR config for port forwarding resilience
      hmr: {
        // Use polling for more reliable change detection in remote environments
        // clientPort: port, // Uncomment if port forwarding maps to different port
        timeout: 5000, // Longer timeout for slow connections
        overlay: true, // Show errors in browser
      },
      watch: {
        // Use polling instead of native fs events (more reliable with remote filesystems)
        usePolling: true,
        interval: 1000, // Check every second
        // Ignore node_modules and other large directories
        ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/_fresh/**"],
      },
    },
    build: {
      sourcemap: false, // Suppress sourcemap warnings
    },
  };
});
