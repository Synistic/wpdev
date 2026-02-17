/** Check if Docker is available and running */
export async function checkDocker(): Promise<{
	available: boolean;
	error?: string;
}> {
	try {
		const proc = Bun.spawn(["docker", "info"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			return {
				available: false,
				error:
					"Docker is not running. Start Docker Desktop or the Docker daemon.",
			};
		}

		return { available: true };
	} catch {
		return {
			available: false,
			error: "Docker is not installed. Install Docker from https://docker.com",
		};
	}
}

/** Check if docker compose is available */
export async function checkDockerCompose(): Promise<boolean> {
	try {
		const proc = Bun.spawn(["docker", "compose", "version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}
