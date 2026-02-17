import { Select } from "@inkjs/ui";
import { useInput } from "ink";
import { useRef } from "react";

type Option = {
	label: string;
	value: string;
};

type Props = {
	options: Option[];
	defaultValue?: string;
	onSubmit: (value: string) => void;
};

/**
 * Select wrapper that fires onSubmit on Enter.
 * The default @inkjs/ui Select only fires onChange when the value *changes*,
 * which means pressing Enter on the already-selected default does nothing.
 */
export function SelectConfirm({ options, defaultValue, onSubmit }: Props) {
	const currentValue = useRef(defaultValue ?? options[0]?.value ?? "");
	const submitted = useRef(false);

	useInput((_input, key) => {
		if (key.return && !submitted.current) {
			submitted.current = true;
			onSubmit(currentValue.current);
		}
	});

	return (
		<Select
			options={options}
			defaultValue={defaultValue}
			onChange={(value) => {
				currentValue.current = value;
			}}
		/>
	);
}
