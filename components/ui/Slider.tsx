import type { InputHTMLAttributes } from "react";

export function Slider(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input className="slider" type="range" {...props} />;
}
