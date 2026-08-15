import Link from "next/link";

export default function NotFound() {
  return <main className="standalone-state"><h1>Page not found</h1><p>The requested page or record does not exist.</p><Link className="button button-primary" href="/dashboard">Back to dashboard</Link></main>;
}
