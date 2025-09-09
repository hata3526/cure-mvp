import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "./components/ui/button";
import { ThemeToggle } from "./components/primitives/theme-toggle";

function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-6 py-3">
        <Link to="/dashboard" className="font-semibold">
          ケア記録
        </Link>
        <nav className="flex items-center gap-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? "text-primary" : "text-muted-foreground"
            }
          >
            ダッシュボード
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? "text-primary" : "text-muted-foreground"
            }
          >
            設定
          </NavLink>
          <Button asChild variant="secondary" size="sm">
            <Link to="/review/new">レビュー</Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export default function AppLayout() {
  return (
    <div className="min-h-full">
      <Header />
      <main className="mx-auto max-w-7xl px-4 md:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

 
