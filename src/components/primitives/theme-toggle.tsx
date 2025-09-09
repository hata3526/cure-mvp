import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return (
      localStorage.getItem("theme") === "dark" ||
      document.documentElement.classList.contains("dark")
    );
  });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);
  return (
    <button
      type="button"
      aria-label="テーマ切替"
      onClick={() => setIsDark((v) => !v)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}


