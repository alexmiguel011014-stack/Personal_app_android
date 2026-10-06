import Link from "next/link";

// The product's name as the template draws it (DESIGN.md: a typographic wordmark, no approved logo
// file): "ALLU." in heavy type with the orange full stop, and "personal" beside it, small.
// Shared by the signed-in frame and the public one.
export function Wordmark({ href, label }: { href: string; label: string }) {
  return (
    <Link className="wordmark" href={href} aria-label={label}>
      ALLU<span>.</span>
      <small className="wordmark-tag">personal</small>
    </Link>
  );
}
