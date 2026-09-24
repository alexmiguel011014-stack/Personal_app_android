import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GOALS.md §23f: a static export. Phase 1 needs no server — auth and data are the Firebase client
  // SDK in the browser, security is firestore.rules — and a static build deploys to any host §23l
  // picks, including where the site lives today (GitHub Pages). It also makes Next fail fast, in
  // `next dev` too, on anything that would need a server (Server Actions, route handlers reading the
  // request, cookies, redirects/rewrites, dynamic routes without generateStaticParams) — which is
  // why the invite link is /convite?c=CODE rather than /convite/CODE.
  output: "export",
};

export default nextConfig;
