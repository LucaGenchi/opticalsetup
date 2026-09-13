// The header every generated section shares: the same mark, the same links and
// the same wording for the canvas button, so no section invents its own name
// for it. Kept in one module because a nav that differs per section is the
// first thing a reader notices when moving between them.
export const brandMark = () => `
  <svg class="brand-mark" viewBox="0 0 130 85" aria-hidden="true">
    <g class="mark-accent" stroke-width="4" stroke-linecap="round">
      <line x1="22" y1="45" x2="29" y2="45"/>
      <line x1="20.8" y1="47.8" x2="25.8" y2="52.8"/>
      <line x1="18" y1="49" x2="18" y2="56"/>
      <line x1="15.2" y1="47.8" x2="10.2" y2="52.8"/>
      <line x1="14" y1="45" x2="7" y2="45"/>
      <line x1="15.2" y1="42.2" x2="10.2" y2="37.2"/>
      <line x1="18" y1="41" x2="18" y2="34"/>
      <line x1="20.8" y1="42.2" x2="25.8" y2="37.2"/>
    </g>
    <line class="mark-accent" x1="29" y1="45" x2="77" y2="45" stroke-width="4" stroke-linecap="round"/>
    <polygon class="mark-ink" points="64,12 42,68 86,68" fill="none" stroke-width="4.5" stroke-linejoin="round"/>
    <g class="mark-accent" stroke-width="2.4" stroke-linecap="round">
      <line x1="77" y1="45" x2="108" y2="22"/>
      <line x1="77" y1="45" x2="108" y2="34"/>
      <line x1="77" y1="45" x2="108" y2="45"/>
      <line x1="77" y1="45" x2="108" y2="56"/>
      <line x1="77" y1="45" x2="108" y2="68"/>
    </g>
    <line class="mark-ink" x1="108" y1="14" x2="108" y2="76" stroke-width="4" stroke-linecap="round"/>
    <g class="mark-ink" stroke-width="3" stroke-linecap="round">
      <line x1="108" y1="22" x2="115" y2="22"/>
      <line x1="108" y1="34" x2="115" y2="34"/>
      <line x1="108" y1="45" x2="115" y2="45"/>
      <line x1="108" y1="56" x2="115" y2="56"/>
      <line x1="108" y1="68" x2="115" y2="68"/>
    </g>
  </svg>`;

export const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 130 85'%3E%3Cg stroke='%231361fa' stroke-width='6' stroke-linecap='round'%3E%3Cline x1='22' y1='45' x2='29' y2='45'/%3E%3Cline x1='18' y1='49' x2='18' y2='56'/%3E%3Cline x1='14' y1='45' x2='7' y2='45'/%3E%3Cline x1='18' y1='41' x2='18' y2='34'/%3E%3C/g%3E%3Cline x1='29' y1='45' x2='77' y2='45' stroke='%231361fa' stroke-width='6' stroke-linecap='round'/%3E%3Cpolygon points='64,12 42,68 86,68' fill='none' stroke='%230a1a33' stroke-width='7' stroke-linejoin='round'/%3E%3Cg stroke='%231361fa' stroke-width='4' stroke-linecap='round'%3E%3Cline x1='77' y1='45' x2='112' y2='28'/%3E%3Cline x1='77' y1='45' x2='112' y2='45'/%3E%3Cline x1='77' y1='45' x2='112' y2='62'/%3E%3C/g%3E%3C/svg%3E";

export function header(base) {
  return `
  <header class="site-header">
    <a class="brand" href="${base}/">${brandMark()}<span class="brand-ink">Optical</span><span class="brand-accent">Setup</span></a>
    <div class="header-actions">
      <a class="plain" href="${base}/wiki/">Wiki</a>
      <a class="plain" href="${base}/example-setups/">Examples</a>
      <a class="plain" href="${base}/collections/">Collections</a>
      <a class="plain" href="${base}/community/">Community</a>
      <a class="btn" href="${base}/sketch/">Open the canvas</a>
    </div>
  </header>`;
}
