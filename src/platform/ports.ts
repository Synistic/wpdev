import { createServer } from "node:net";
import { listSites } from "../config/site.ts";

/** Check if a port is available at the OS level */
function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		server.listen(port, "127.0.0.1");
	});
}

/** Get all ports already used by existing wpdev sites */
function getUsedPorts(): Set<number> {
	const used = new Set<number>();
	for (const site of listSites()) {
		const ports = derivePorts(site.port);
		used.add(ports.wp);
		used.add(ports.mailpitSmtp);
		used.add(ports.mailpitUi);
	}
	return used;
}

/** Check if a base port and all its derived ports are available */
export async function isPortAvailable(basePort: number): Promise<{
	available: boolean;
	conflict?: { port: number; reason: string };
}> {
	const ports = derivePorts(basePort);
	const usedByWpdev = getUsedPorts();

	// Check against existing wpdev sites first
	for (const [label, port] of [
		["WordPress", ports.wp],
		["Mailpit SMTP", ports.mailpitSmtp],
		["Mailpit UI", ports.mailpitUi],
	] as const) {
		if (usedByWpdev.has(port)) {
			return {
				available: false,
				conflict: {
					port,
					reason: `Port ${port} (${label}) wird bereits von einer anderen wpdev-Site genutzt`,
				},
			};
		}
	}

	// Check OS-level availability
	for (const [label, port] of [
		["WordPress", ports.wp],
		["Mailpit SMTP", ports.mailpitSmtp],
		["Mailpit UI", ports.mailpitUi],
	] as const) {
		const free = await isPortFree(port);
		if (!free) {
			return {
				available: false,
				conflict: {
					port,
					reason: `Port ${port} (${label}) ist bereits belegt`,
				},
			};
		}
	}

	return { available: true };
}

/** Find a free port starting from the given port */
export async function findFreePort(startPort = 8080): Promise<number> {
	let port = startPort;
	const maxPort = startPort + 1000;

	while (port < maxPort) {
		const result = await isPortAvailable(port);
		if (result.available) {
			return port;
		}
		port++;
	}

	throw new Error(
		`Kein freier Port im Bereich ${startPort}-${maxPort} gefunden. Gib einen manuell an mit --port.`,
	);
}

/** Calculate all derived ports from a base port */
export function derivePorts(basePort: number) {
	return {
		wp: basePort,
		mailpitSmtp: basePort + 1000,
		mailpitUi: basePort + 2000,
	};
}
