import { z } from "zod";

export const phpVersions = ["7.4", "8.0", "8.1", "8.2", "8.3", "8.4"] as const;
export type PhpVersion = (typeof phpVersions)[number];

export const dbEngines = ["mariadb", "mysql"] as const;
export type DbEngine = (typeof dbEngines)[number];

export const siteConfigSchema = z.object({
	name: z.string(),
	port: z.number(),
	php: z.enum(phpVersions).default("8.2"),
	db: z.enum(dbEngines).default("mariadb"),
	locale: z.string().default("de_DE"),
	wpVersion: z.string().default("latest"),
	platform: z.enum(["macos", "linux", "wsl"]),
	created: z.string().datetime(),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

export const globalConfigSchema = z.object({
	sitesDir: z.string(),
	defaultPhp: z.enum(phpVersions).default("8.2"),
	defaultDb: z.enum(dbEngines).default("mariadb"),
	defaultLocale: z.string().default("de_DE"),
	defaultPlugins: z.array(z.string()).default(["all-in-one-wp-migration"]),
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
