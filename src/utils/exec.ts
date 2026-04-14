export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Run a command and capture output */
export async function exec(
	cmd: string[],
	options?: { cwd?: string; silent?: boolean },
): Promise<ExecResult> {
	const spawnOpts = {
		cwd: options?.cwd,
		stdout: "pipe" as const,
		stderr: "pipe" as const,
	};

	const proc = Bun.spawn(cmd, spawnOpts);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;

	return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** Run a command with output streamed to the terminal */
export async function execStream(
	cmd: string[],
	options?: { cwd?: string },
): Promise<number> {
	const proc = Bun.spawn(cmd, {
		cwd: options?.cwd,
		stdout: "inherit",
		stderr: "inherit",
	});
	return proc.exited;
}

/** Run docker compose in a site directory */
export async function dockerCompose(
	siteDir: string,
	args: string[],
	options?: { silent?: boolean; stream?: boolean },
): Promise<ExecResult> {
	const cmd = ["docker", "compose", ...args];

	if (options?.stream) {
		const exitCode = await execStream(cmd, { cwd: siteDir });
		return { exitCode, stdout: "", stderr: "" };
	}

	return exec(cmd, { cwd: siteDir });
}
