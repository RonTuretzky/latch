import { NavLink } from "react-router-dom";
import { Logo, cn } from "@breadcoop/ui";
import { GithubLogo } from "@phosphor-icons/react";
import { BRAND } from "../brand";

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", isActive ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-black/5")
      }
    >
      {children}
    </NavLink>
  );
}

export function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f6f4ef]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
        <NavLink to="/" className="flex items-center gap-2.5">
          <Logo color="orange" size={30} />
          <div className="leading-none">
            <div className="text-lg font-bold tracking-tight">{BRAND.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-400">{BRAND.powered}</div>
          </div>
        </NavLink>

        <nav className="flex items-center gap-1">
          <Tab to="/">Product</Tab>
          <Tab to="/app">Launch app</Tab>
          <Tab to="/docs">Docs</Tab>
          <a href={BRAND.repoUrl} target="_blank" rel="noreferrer" className="ml-1 rounded-lg p-2 text-neutral-500 hover:bg-black/5" aria-label="GitHub">
            <GithubLogo size={20} />
          </a>
        </nav>
      </div>
    </header>
  );
}
