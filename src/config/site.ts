import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSiteConfigPath, getSiteDir } from "../utils/paths.ts";
import { loadGlobalConfig } from "./global.ts";
import { type SiteConfig, siteConfigSchema } from "./schema.ts";

export function loadSiteConfig(name: string): SiteConfig | null {
	const config = loadGlobalConfig();
	const siteDir = getSiteDir(config.sitesDir, name);
	const configPath = getSiteConfigPath(siteDir);

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const raw = JSON.parse(readFileSync(configPath, "utf-8"));
		return siteConfigSchema.parse(raw);
	} catch {
		return null;
	}
}

export function saveSiteConfig(siteDir: string, config: SiteConfig): void {
	const configPath = getSiteConfigPath(siteDir);
	writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function siteExists(name: string): boolean {
	const config = loadGlobalConfig();
	const siteDir = getSiteDir(config.sitesDir, name);
	return existsSync(siteDir);
}

export function listSites(): SiteConfig[] {
	const config = loadGlobalConfig();
	const sitesDir = config.sitesDir;

	if (!existsSync(sitesDir)) return [];

	const entries = readdirSync(sitesDir, { withFileTypes: true });
	const sites: SiteConfig[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const configPath = getSiteConfigPath(join(sitesDir, entry.name));
		if (!existsSync(configPath)) continue;

		try {
			const raw = JSON.parse(readFileSync(configPath, "utf-8"));
			sites.push(siteConfigSchema.parse(raw));
		} catch {
			// Skip invalid configs
		}
	}

	return sites;
}
