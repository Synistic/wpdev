import { Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";

type StepStatus = "pending" | "active" | "done" | "error";

type StepProps = {
	label: string;
	status: StepStatus;
	detail?: string;
};

export function Step({ label, status, detail }: StepProps) {
	const icon =
		status === "done" ? (
			<Text color="green" bold>
				{"\u2713"}
			</Text>
		) : status === "error" ? (
			<Text color="red" bold>
				{"\u2717"}
			</Text>
		) : status === "active" ? (
			<Spinner />
		) : (
			<Text dimColor>{"\u25CB"}</Text>
		);

	return (
		<Box gap={1}>
			{icon}
			<Text
				dimColor={status === "pending"}
				color={status === "error" ? "red" : undefined}
				bold={status === "active"}
			>
				{label}
			</Text>
			{detail && status === "done" && <Text dimColor>({detail})</Text>}
		</Box>
	);
}

type StepListProps = {
	steps: Array<{ key: string; label: string; detail?: string }>;
	currentStep: string;
	completedSteps: Set<string>;
	errorStep?: string;
};

export function StepList({
	steps,
	currentStep,
	completedSteps,
	errorStep,
}: StepListProps) {
	return (
		<Box flexDirection="column">
			{steps.map((step) => {
				let status: StepStatus = "pending";
				if (completedSteps.has(step.key)) status = "done";
				else if (step.key === errorStep) status = "error";
				else if (step.key === currentStep) status = "active";

				return (
					<Step
						key={step.key}
						label={step.label}
						status={status}
						detail={step.detail}
					/>
				);
			})}
		</Box>
	);
}
