/** 像素网格与修整笔，体现逐点修改颜色。 */
export function BrandMark() {
  return (
    <svg
      className="brand-symbol"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <g fill="currentColor" opacity=".55">
        <rect x="2" y="3" width="6" height="6" rx="1" />
        <rect x="10" y="3" width="6" height="6" rx="1" />
        <rect x="2" y="11" width="6" height="6" rx="1" />
        <rect x="2" y="19" width="6" height="6" rx="1" />
      </g>
      <rect x="10" y="19" width="6" height="6" rx="1" fill="currentColor" />
      <path
        d="M12 16L24 4L29 9L17 21L11 22L12 16Z"
        fill="#10120f"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M21 7L26 12M12 16L17 21" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
