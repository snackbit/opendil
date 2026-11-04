import { Brand } from "./brand";
import { DocsMenuSlot, HeaderSearch, PrimaryNav } from "./header-nav";
import { repository, repositoryStars } from "./repository";
import { ThemeControl } from "./theme-control";

function GitHubMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .8a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.5v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.1 4.4 4.4 0 0 1 .1-3.1s1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17 4.7 18 5 18 5a4.4 4.4 0 0 1 .1 3.1 4.7 4.7 0 0 1 1.2 3.2c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 12 .8Z" />
    </svg>
  );
}

/** The header every route shares. It lives in the root layout, so it persists across navigation. */
export async function SiteHeader() {
  const stars = await repositoryStars();
  return (
    <header className="od-site-header">
      <div className="od-header">
        <Brand />
        <PrimaryNav />
        <div className="od-header-actions">
          <HeaderSearch />
          <a
            className="od-github"
            href={repository}
            target="_blank"
            rel="noreferrer"
            aria-label={
              stars === null
                ? "OpenDIL on GitHub"
                : `OpenDIL on GitHub, ${stars} stars`
            }
          >
            <GitHubMark />
            <span>GitHub</span>
            {stars !== null && <span className="od-star-count">☆ {stars}</span>}
          </a>
          <ThemeControl />
          <DocsMenuSlot />
        </div>
      </div>
    </header>
  );
}
