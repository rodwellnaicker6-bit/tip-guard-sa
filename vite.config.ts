import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function resolveBuildId(): string {
  if (process.env.BUILD_ID?.trim()) return process.env.BUILD_ID.trim();
  return String(Date.now());
}

function resolveGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig(() => {
  const buildId = resolveBuildId();
  const gitSha = resolveGitSha();

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "tipguard-inject-build-meta",
        transformIndexHtml(html) {
          return html.replace(
            "</head>",
            `    <meta name="tipguard-build-id" content="${buildId}" />\n    <meta name="tipguard-git-sha" content="${gitSha}" />\n  </head>`,
          );
        },
      },
    ],
    envDir: ".",
    envPrefix: ["VITE_"],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __GIT_SHA__: JSON.stringify(gitSha),
    },
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "react";
            }
            if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run")) {
              return "router";
            }
            if (id.includes("node_modules/@supabase")) {
              return "supabase";
            }
            if (id.includes("node_modules/@sentry")) {
              return "sentry";
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
