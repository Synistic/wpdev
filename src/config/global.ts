import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	DEFAULT_SITES_DIR,
	GLOBAL_CONFIG_PATH,
	WPDEV_HOME,
} from "../utils/paths.ts";
import { type GlobalConfig, globalConfigSchema } from "./schema.ts";

const defaults: GlobalConfig = {
	sitesDir: DEFAULT_SITES_DIR,
	defaultPhp: "8.2",
	defaultDb: "mariadb",
	defaultLocale: "de_DE",
	defaultPlugins: ["all-in-one-wp-migration"],
};

export function loadGlobalConfig(): GlobalConfig {
	if (!existsSync(GLOBAL_CONFIG_PATH)) {
		return defaults;
	}

	try {
		const raw = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
		return globalConfigSchema.parse(raw);
	} catch {
		return defaults;
	}
}

export function saveGlobalConfig(config: GlobalConfig): void {
	mkdirSync(WPDEV_HOME, { recursive: true });
	writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function ensureGlobalDirs(): void {
	const config = loadGlobalConfig();
	mkdirSync(config.sitesDir, { recursive: true });
	mkdirSync(WPDEV_HOME, { recursive: true });
}
