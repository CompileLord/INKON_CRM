import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "../../src/i18n";
import "../../src/index.css";
import { EnrollmentStatusBadge } from "../../src/components/enrollments/EnrollmentStatusBadge";
import { applyTheme, initTheme } from "../../src/lib/theme";
import type { EnrollmentStatus } from "../../src/lib/enrollments/types";

const params = new URLSearchParams(location.search);
const requestedLocale = params.get("locale") ?? "en";
const requestedTheme = params.get("theme") ?? "light";

await i18n.changeLanguage(requestedLocale);
initTheme();
applyTheme(requestedTheme as "light" | "dark" | "system");

const statuses: EnrollmentStatus[] = ["active", "withdrawn", "completed"];

function EnrollmentStatusFixture() {
  return (
    <main
      className="mx-auto flex max-w-2xl min-w-0 flex-col gap-6 p-6 text-ink"
      data-fixture="enrollment-status-badge-fixture"
    >
      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-xl font-bold tracking-tight">
          EnrollmentStatusBadge Component Fixture
        </h1>
        <p className="text-xs text-muted">
          Isolated component preview rendering production EnrollmentStatusBadge with production CSS and i18n.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h2 className="text-sm font-semibold text-muted">Statuses</h2>
        <div className="flex flex-wrap items-center gap-4">
          {statuses.map((status) => (
            <div
              key={status}
              data-status-wrapper={status}
              className="flex items-center gap-2 rounded-xl border border-border/50 bg-strip/50 p-2.5"
            >
              <span className="text-xs font-medium text-muted capitalize">{status}:</span>
              <EnrollmentStatusBadge status={status} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

const rootElem = document.getElementById("root");
if (rootElem) {
  createRoot(rootElem).render(
    <I18nextProvider i18n={i18n}>
      <EnrollmentStatusFixture />
    </I18nextProvider>,
  );
}
