import { HashRouter, Routes, Route } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { Landing } from "./pages/Landing";
import { Console } from "./pages/Console";
import { Docs } from "./pages/Docs";

// HashRouter (`/#/app`) is deliberate: it needs no server-side SPA fallback, so it works as a plain
// static export on GitHub Pages project subpaths.
export function App() {
  return (
    <HashRouter>
      <div className="min-h-screen text-neutral-800">
        <NavBar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Console />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
