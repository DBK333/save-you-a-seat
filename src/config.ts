export interface AppConfig {
  mode: string;
  mapsKey: string;
  mapId: string;
  apiUrl: string;
  poolId: string;
  clientId: string;
}
export function configurationError(settings: AppConfig): string | null {
  if (settings.mode === "demo") return null;
  if (settings.mode === "api")
    return "The Python API and Cognito connection are not available in this frontend release. Demo authentication has not been enabled. Set VITE_DATA_MODE=demo to explore the local demonstration.";
  return `Unknown data mode “${settings.mode}”. Choose demo explicitly; production authentication cannot fall back to a local account.`;
}
export const config: AppConfig = {
  mode:
    import.meta.env.VITE_DATA_MODE ||
    (import.meta.env.DEV ? "demo" : "unconfigured"),
  mapsKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "",
  apiUrl: import.meta.env.VITE_API_URL || "",
  poolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "",
};
