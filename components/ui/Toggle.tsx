import type { InputHTMLAttributes } from "react";

export function Toggle({ "aria-label": label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <label className="toggle"><input type="checkbox" aria-label={label} {...props} /><span aria-hidden="true" /></label>;
}
