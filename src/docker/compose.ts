import { stringify } from "yaml";
import type { SiteConfig } from "../config/schema.ts";
import { derivePorts } from "../platform/ports.ts";

function getDbImage(engine: SiteConfig["db"]): string {
	return engine === "mariadb" ? "mariadb:11" : "mysql:8.0";
}

export function generateComposeYaml(config: SiteConfig): string {
	const ports = derivePorts(config.port);

	const compose = {
		services: {
			db: {
				image: getDbImage(config.db),
				container_name: `${config.name}_db`,
				restart: "unless-stopped",
				environment: {
					MYSQL_DATABASE: "wordpress",
					MYSQL_USER: "wordpress",
					MYSQL_PASSWORD: "wordpress",
					MYSQL_ROOT_PASSWORD: "rootpassword",
				},
				volumes: ["db_data:/var/lib/mysql"],
				healthcheck: {
					test: ["CMD", "mysqladmin", "ping", "-h", "localhost"],
					interval: "5s",
					timeout: "5s",
					retries: 10,
				},
			},
			wordpress: {
				build: {
					context: ".",
					dockerfile: "Dockerfile",
				},
				container_name: `${config.name}_wordpress`,
				restart: "unless-stopped",
				depends_on: {
					db: {
						condition: "service_healthy",
					},
				},
				environment: {
					WORDPRESS_DB_HOST: "db",
					WORDPRESS_DB_USER: "wordpress",
					WORDPRESS_DB_PASSWORD: "wordpress",
					WORDPRESS_DB_NAME: "wordpress",
					WP_PORT: String(config.port),
					WP_SITE_NAME: config.name,
					WP_LOCALE: config.locale,
					HOST_UID: String(process.getuid?.() ?? 1000),
				},
				volumes: [
					"./html:/var/www/html",
					"./php.conf.d/custom.ini:/usr/local/etc/php/conf.d/custom.ini:ro",
				],
			},
			nginx: {
				image: "nginx:alpine",
				container_name: `${config.name}_nginx`,
				restart: "unless-stopped",
				depends_on: ["wordpress"],
				ports: [`${ports.wp}:80`],
				volumes: [
					"./html:/var/www/html:ro",
					"./nginx.conf:/etc/nginx/conf.d/default.conf:ro",
				],
			},
			mailpit: {
				image: "axllent/mailpit",
				container_name: `${config.name}_mailpit`,
				restart: "unless-stopped",
				ports: [`${ports.mailpitUi}:8025`, `${ports.mailpitSmtp}:1025`],
				environment: {
					MP_SMTP_AUTH_ACCEPT_ANY: 1,
					MP_SMTP_AUTH_ALLOW_INSECURE: 1,
				},
			},
		},
		volumes: {
			db_data: null,
		},
	};

	return stringify(compose);
}
