import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
 * Content Security Policy without nonces (nonces would force every page to
 * render dynamically and are incompatible with the prerendered shells that
 * cacheComponents produces). Next.js and next-themes inline small bootstrap
 * scripts, so script-src needs 'unsafe-inline'; React needs 'unsafe-eval' in
 * development only. next/font self-hosts the fonts, so no third-party origins
 * are allowed anywhere. The dev server's HMR uses a same-origin WebSocket.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// transformers.js loads onnxruntime-node through createRequire, which file tracing
// cannot follow: ship its JS, its CommonJS dependency and this platform's native binding
// with every route that imports the model stack.
const onnxRuntimeFiles = [
  "./node_modules/onnxruntime-node/package.json",
  "./node_modules/onnxruntime-node/dist/**/*",
  `./node_modules/onnxruntime-node/bin/napi-v6/${process.platform}/${process.arch}/**/*`,
  "./node_modules/onnxruntime-common/**/*",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // `node .next/standalone/server.js` (see Dockerfile): only the traced files ship.
  output: "standalone",
  poweredByHeader: false,
  // @huggingface/transformers and onnxruntime-node are on Next.js' built-in
  // serverExternalPackages list; unpdf and mammoth are plain JavaScript and bundle fine.
  outputFileTracingIncludes: {
    "/api/analyze": onnxRuntimeFiles,
    "/api/health": onnxRuntimeFiles,
  },
  outputFileTracingExcludes: {
    // Downloaded models are runtime data (LTR_MODEL_CACHE_DIR), not build output.
    "/*": ["./node_modules/@huggingface/transformers/.cache/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
