import { defineConfig, loadEnv } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + "/../..", "");
  return {
    plugins: [fresh(), tailwindcss()],
    server: {
      port: parseInt(env.PORT_DASHBOARD || "8081"),
      allowedHosts: ["intelligence.casys.ai", "localhost"],
    },
  };
});
