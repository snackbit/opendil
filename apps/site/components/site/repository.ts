export const repository = "https://github.com/snackbit/opendil";

let pending: Promise<number | null> | undefined;

async function fetchStars(): Promise<number | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/snackbit/opendil",
      {
        signal: AbortSignal.timeout(2000),
        headers: {
          Accept: "application/vnd.github+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: "Bearer " + process.env.GITHUB_TOKEN }
            : {}),
        },
      },
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data &&
      typeof data === "object" &&
      "stargazers_count" in data &&
      typeof data.stargazers_count === "number" &&
      Number.isInteger(data.stargazers_count) &&
      data.stargazers_count >= 0
      ? data.stargazers_count
      : null;
  } catch {
    return null;
  }
}

/** The repository's star count, fetched once per server process; null when GitHub is unreachable. */
export function repositoryStars() {
  return (pending ??= fetchStars());
}
