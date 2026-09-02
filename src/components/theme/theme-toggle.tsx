import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes doesn't know the resolved theme until after mount (it reads
  // localStorage/matchMedia client-side) — render a neutral placeholder
  // until then to avoid a light/dark icon flash mismatching the real theme.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : undefined}
    >
      {mounted ? isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" /> : null}
    </Button>
  );
}
