import { DemoService } from "./demo";
import { config, configurationError } from "../config";
export const getConfigurationError = () => configurationError(config);
// API mode is blocked by the root configuration gate; never grant demo privileges as a fallback.
export const service = new DemoService({
  storage: config.mode === "demo" ? undefined : null,
});
