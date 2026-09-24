import { defineConfig } from "vite";
import { resolve } from "path";
import * as fs from "fs";

function htmlIncludes() {
  return {
    name: "html-includes",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        let out = html;
        for (let i = 0; i < 10 && /<include\s+src="[^"]+"\s*\/>/.test(out); i++) {
          out = out.replace(/<include\s+src="([^"]+)"\s*\/>/g, (_match, src) => {
            const filePath = resolve(__dirname, src as string);
            if (fs.existsSync(filePath)) {
              return fs.readFileSync(filePath, "utf-8");
            }
            console.warn(`[html-includes] File not found: ${filePath}`);
            return "";
          });
        }
        return out;
      },
    },
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [htmlIncludes()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        verify: resolve(__dirname, "verify.html"),
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: { loadPaths: [resolve(__dirname, "src/styles")] },
    },
  },
});
