import { readFileSync } from "node:fs";

export type Platform = "macos" | "linux" | "wsl";

let cachedPlatform: Platform | null = null;

export function detectPlatform(): Platform {
	if (cachedPlatform) return cachedPlatform;

	const platform = process.platform;

	if (platform === "darwin") {
		cachedPlatform = "macos";
	} else if (platform === "linux") {
		// Check if running under WSL
		try {
			const release = readFileSync("/proc/version", "utf-8");
			if (release.toLowerCase().includes("microsoft")) {
				cachedPlatform = "wsl";
			} else {
				cachedPlatform = "linux";
			}
		} catch {
			cachedPlatform = "linux";
		}
	} else {
		// Fallback to linux for unknown platforms
		cachedPlatform = "linux";
	}

	return cachedPlatform;
}

export function platformSupportsAcl(): boolean {
	const platform = detectPlatform();
	return platform === "linux" || platform === "wsl";
}
