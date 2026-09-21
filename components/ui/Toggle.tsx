import type { InputHTMLAttributes } from "react";

export function Toggle({ "aria-label": label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  // 不用 label 包裹：label 会把冒泡的点击再转发给控件造成双触发；
  // input 本来就是全尺寸覆盖（inset:0），点击区不受影响。
  return <span className="toggle"><input type="checkbox" aria-label={label} {...props} /><span aria-hidden="true" /></span>;
}
