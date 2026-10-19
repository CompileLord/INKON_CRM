import { ListboxPicker, type ListboxOption } from "./ListboxPicker";

interface SelectProps {
  label: string;
  options: readonly ListboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export function Select({ label, options, value, onChange, placeholder, id, disabled, invalid, describedBy }: SelectProps) {
  return (
    <ListboxPicker
      layout="field"
      icon={null}
      label={label}
      ariaLabel={label}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      id={id}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
