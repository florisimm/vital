import { supabase } from './supabase';

export type Services = {
  strava: boolean;
  hevy: boolean;
  google: boolean;
  fitbit: boolean;
  fitbitNeedsReconnect: boolean;
};

// Which external data sources are connected for the current user.
// Ported from the web app's lib/services.ts (same tables/queries).
export async function fetchServices(): Promise<Services> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { strava: false, hevy: false, google: false, fitbit: false, fitbitNeedsReconnect: false };
  }
  const [strava, hevy, google, fitbit] = await Promise.all([
    supabase.from('strava_tokens').select('id').eq('user_id', user.id).limit(1),
    supabase.from('hevy_workouts').select('id').eq('user_id', user.id).limit(1),
    supabase.from('google_tokens').select('user_id').eq('user_id', user.id).limit(1),
    supabase.from('fitbit_tokens').select('user_id, needs_reconnect').eq('user_id', user.id).limit(1),
  ]);
  const fitbitRow = fitbit.data?.[0] as { needs_reconnect?: boolean } | undefined;
  return {
    strava: (strava.data?.length ?? 0) > 0,
    hevy: (hevy.data?.length ?? 0) > 0,
    google: (google.data?.length ?? 0) > 0,
    fitbit: !!fitbitRow,
    fitbitNeedsReconnect: !!fitbitRow?.needs_reconnect,
  };
}
