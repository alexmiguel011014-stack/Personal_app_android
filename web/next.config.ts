import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GOALS.md §23f: a static export. Phase 1 needs no server — auth and data are the Firebase client
  // SDK in the browser, security is firestore.rules — and a static build deploys to any host §23l
  // picks, including where the site lives today (GitHub Pages). It also makes Next fail fast, in
  // `next dev` too, on anything that would need a server (Server Actions, route handlers reading the
  // request, cookies, redirects/rewrites, dynamic routes without generateStaticParams) — which is
  // why the invite link is /convite?c=CODE rather than /convite/CODE.
  output: "export",
  // GOALS.md §23l: GitHub Pages serves this repo's site under /Personal_app_android/, so the deploy
  // builds with NEXT_PUBLIC_BASE_PATH=/Personal_app_android; locally it's empty. Next prefixes links
  // and assets itself; the two hand-built URLs (prompt assets, invite link) read the same variable.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  // /me/index.html rather than /me.html: a directory index is served by any static host.
  trailingSlash: true,
};

export default nextConfig;
