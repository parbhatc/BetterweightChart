/**
 * @typedef {{ time: number, price: number }} DrawPoint
 * @typedef {{
 *   id: string,
 *   type: string,
 *   points: DrawPoint[],
 *   color?: string,
 *   colorOpacity?: number,
 *   lineWidth?: number,
 *   lineStyle?: number,
 *   textColor?: string,
 *   textColorOpacity?: number,
 *   label?: string,
 *   fontSize?: number,
 *   textAlignV?: string,
 *   textAlignH?: string,
 *   extendLeft?: boolean,
 *   extendRight?: boolean,
 *   visibility?: Record<string, boolean>,
 *   locked?: boolean,
 * }} UserDrawing
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   defaultTool?: string,
 *   icon?: string,
 *   tools: string[],
 *   isCursor?: boolean,
 *   flyoutSections?: { title: string | null, tools: string[] }[],
 * }} ToolGroupDef
 */

export {};
