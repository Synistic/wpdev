import { homedir } from "node:os";
import { join } from "node:path";

/** Global wpdev config directory */
export const WPDEV_HOME = join(homedir(), ".wpdev");

/** Global config file */
export const GLOBAL_CONFIG_PATH = join(WPDEV_HOME, "config.json");

/** Snapshots directory */
export const SNAPSHOTS_DIR = join(WPDEV_HOME, "snapshots");

/** Default sites directory — can be overridden in global config */
export const DEFAULT_SITES_DIR = join(WPDEV_HOME, "sites");

/** Get the site directory for a given site name */
export function getSiteDir(sitesDir: string, name: string): string {
	return join(sitesDir, name);
}

/** Get the site config path */
export function getSiteConfigPath(siteDir: string): string {
	return join(siteDir, "wpdev.json");
}
