import { Box, Text } from "ink";

type SummaryEntry = {
	label: string;
	value: string;
};

type Props = {
	entries: SummaryEntry[];
};

export function WizardSummary({ entries }: Props) {
	if (entries.length === 0) return null;

	const maxLabelLen = Math.max(...entries.map((e) => e.label.length));

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor="gray"
			paddingX={1}
		>
			{entries.map((entry) => (
				<Box key={entry.label} gap={1}>
					<Text dimColor>{entry.label.padEnd(maxLabelLen)}</Text>
					<Text color="cyan">{entry.value}</Text>
				</Box>
			))}
		</Box>
	);
}
