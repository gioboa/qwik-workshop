import {
  Resource,
  component$,
  useResource$,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import {
  DocumentHead,
  RequestHandler,
  routeLoader$,
} from "@builder.io/qwik-city";
import { Octokit } from "octokit";
import { createServerClient } from "supabase-auth-helpers-qwik";

export interface Favorite {
  id: string;
  email: string;
  org: string;
  repo: string;
}

const octokit = new Octokit({
  auth: import.meta.env.VITE_GITHUB_ACCESS_TOKEN,
});

export const onPost: RequestHandler = async ({ json, query }) => {
  const queryText = query.get("q") as string;
  if (!queryText) {
    json(200, []);
  } else {
    const response = await octokit.request("GET /search/users", {
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
      q: queryText,
    });
    json(
      200,
      response.data.items.map((item) => item.login)
    );
  }
};

export const useFavoriteRepositories = routeLoader$<Favorite[]>(
  async (requestEv) => {
    const email = requestEv.sharedMap.get("session")?.user?.email as
      | string
      | undefined;
    if (email) {
      const supabaseClient = createServerClient(
        requestEv.env.get("PUBLIC_SUPABASE_URL")!,
        requestEv.env.get("PUBLIC_SUPABASE_ANON_KEY")!,
        requestEv
      );
      const { data: favorites, error } = await supabaseClient
        .from("favorite")
        .select("*")
        .eq("email", email);
      if (error) {
        throw error;
      }

      return favorites as Favorite[];
    }
    return [];
  }
);

export default component$(() => {
  const favoriteRepositories = useFavoriteRepositories();
  const query = useSignal("");
  const debounceQuery = useSignal("");
  useTask$(async ({ track, cleanup }) => {
    track(query);
    const id = setTimeout(() => {
      debounceQuery.value = query.value;
    }, 200);
    cleanup(() => clearTimeout(id));
  });

  const results = useResource$(async ({ track, cleanup }) => {
    track(debounceQuery);
    if (!debounceQuery.value) return [];

    const controller = new AbortController();
    cleanup(() => controller.abort());
    const response = await fetch("/?q=" + debounceQuery.value, {
      method: "POST",
      signal: controller.signal,
    });
    return (await response.json()) as string[];
  });
  return (
    <>
      <h1>Qwik Github</h1>
      <ul>
        {favoriteRepositories.value.map((fav) => (
          <li key={fav.id}>
            <a href={"/" + fav.org + "/"}>{fav.org}</a>/
            <a href={"/" + fav.org + "/" + fav.repo}>{fav.repo}</a>
          </li>
        ))}
      </ul>
      Search: <input bind:value={query} />
      <Resource
        value={results}
        onPending={() => <li>Loading...</li>}
        onResolved={(results) => (
          <ul>
            {results.map((org) => (
              <li key={org}>
                <a href={"/" + org}>{org}</a>
              </li>
            ))}
          </ul>
        )}
      />
    </>
  );
});

export const head: DocumentHead = {
  title: "Qwik GitHub Workshop",
  meta: [
    {
      name: "description",
      content: "Qwik workshop",
    },
  ],
};
