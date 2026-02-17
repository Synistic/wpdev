import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { loadGlobalConfig } from "../config/global.ts";
import type { SiteConfig } from "../config/schema.ts";
import { listSites } from "../config/site.ts";
import { derivePorts } from "../platform/ports.ts";
import { dockerCompose } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "List all WordPress environments";

type ContainerHealth = "running" | "unhealthy" | "stopped" | "partial";

type SiteStatus = SiteConfig & {
	health: ContainerHealth;
	runningCount: number;
	totalCount: number;
};

async function getSiteHealth(siteDir: string): Promise<{
	health: ContainerHealth;
	runningCount: number;
	totalCount: number;
}> {
	// Get all containers for this site
	const allResult = await dockerCompose(siteDir, ["ps", "--format", "json"]);

	if (allResult.exitCode !== 0 || !allResult.stdout.trim()) {
		return { health: "stopped", runningCount: 0, totalCount: 4 };
	}

	// docker compose ps --format json outputs one JSON per line
	const lines = allResult.stdout
		.trim()
		.split("\n")
		.filter((l) => l.startsWith("{"));

	let total = 0;
	let running = 0;
	let unhealthy = 0;

	for (const line of lines) {
		try {
			const container = JSON.parse(line);
			total++;
			const state = (container.State ?? container.state ?? "").toLowerCase();
			const health = (container.Health ?? container.health ?? "").toLowerCase();

			if (state === "running") {
				running++;
				if (health === "unhealthy") {
					unhealthy++;
				}
			}
		} catch {
			// Skip unparseable lines
		}
	}

	if (total === 0) return { health: "stopped", runningCount: 0, totalCount: 4 };
	if (unhealthy > 0)
		return { health: "unhealthy", runningCount: running, totalCount: total };
	if (running === total)
		return { health: "running", runningCount: running, totalCount: total };
	if (running === 0)
		return { health: "stopped", runningCount: 0, totalCount: total };
	return { health: "partial", runningCount: running, totalCount: total };
}

function healthColor(health: ContainerHealth): string {
	switch (health) {
		case "running":
			return "green";
		case "partial":
			return "yellow";
		case "unhealthy":
			return "red";
		case "stopped":
			return "gray";
	}
}

function healthLabel(
	health: ContainerHealth,
	running: number,
	total: number,
): string {
	switch (health) {
		case "running":
			return "running";
		case "partial":
			return `${running}/${total} up`;
		case "unhealthy":
			return "unhealthy";
		case "stopped":
			return "stopped";
	}
}

export default function List() {
	const [sites, setSites] = useState<SiteStatus[] | null>(null);

	useEffect(() => {
		async function load() {
			const allSites = listSites();
			const globalConfig = loadGlobalConfig();

			const withStatus = await Promise.all(
				allSites.map(async (site) => {
					const siteDir = getSiteDir(globalConfig.sitesDir, site.name);
					const { health, runningCount, totalCount } =
						await getSiteHealth(siteDir);
					return { ...site, health, runningCount, totalCount };
				}),
			);

			setSites(withStatus);
		}
		load();
	}, []);

	if (sites === null) {
		return <Text color="blue">Loading...</Text>;
	}

	if (sites.length === 0) {
		return (
			<Box flexDirection="column" gap={1}>
				<Text>Keine Umgebungen gefunden.</Text>
				<Text dimColor>Erstelle eine mit: wpdev create {"<name>"}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box gap={2} marginBottom={1}>
				<Text bold>
					<Text>{"NAME".padEnd(20)}</Text>
					<Text>{"STATUS".padEnd(14)}</Text>
					<Text>{"PHP".padEnd(8)}</Text>
					<Text>{"DB".padEnd(14)}</Text>
					<Text>{"WORDPRESS".padEnd(15)}</Text>
					<Text>{"MAILPIT"}</Text>
				</Text>
			</Box>
			{sites.map((site) => {
				const ports = derivePorts(site.port);
				const label = healthLabel(
					site.health,
					site.runningCount,
					site.totalCount,
				);
				return (
					<Box key={site.name} gap={2}>
						<Text>
							<Text>{site.name.padEnd(20)}</Text>
							<Text color={healthColor(site.health)}>{label.padEnd(14)}</Text>
							<Text>{site.php.padEnd(8)}</Text>
							<Text>{(site.db ?? "mariadb").padEnd(14)}</Text>
							<Text>{`:${ports.wp}`.padEnd(15)}</Text>
							<Text>{`:${ports.mailpitUi}`}</Text>
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
