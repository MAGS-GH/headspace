import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "aandehul-offline",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { src: "./register-sw.js", defer: true },
            injectTo: "head"
          }
        ];
      }
    }
  ]
});
