import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Chrome ties the granted Bluetooth serial port to this origin; keep it fixed.
const server = { port: 5173, strictPort: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server,
  preview: server,
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
