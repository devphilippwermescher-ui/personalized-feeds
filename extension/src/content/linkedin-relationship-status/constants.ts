export const GRAPHQL_QUERY_IDS = [
  'voyagerIdentityDashProfiles.a1a483e719b20537a256b6853cdca711',
  'voyagerIdentityDashProfiles.ee32334d3bd69a1900a077b5451c646a',
];

export const REQUEST_DELAY_MS = 150;
export const STATUS_FETCH_CONCURRENCY = 3;
export const CACHE_TTL_MS = {
  pending: 1 * 60 * 1000,
  connect: 5 * 60 * 1000,
  following: 5 * 60 * 1000,
  connected: 15 * 60 * 1000,
  withdrawn: 60 * 60 * 1000,
  unavailable: 60 * 60 * 1000,
} as const;
