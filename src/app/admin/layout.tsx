import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";

const NAV_ITEMS = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/surveyor-checks", label: "Surveyor checks" },
  { href: "/admin/directory", label: "Directory" },
  { href: "/admin/stats", label: "Stats" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/reports");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-surface">
        <nav className="mx-auto flex w-full max-w-3xl gap-6 px-6 text-sm font-medium text-muted">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border-b-2 border-transparent py-3 hover:border-brand hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
