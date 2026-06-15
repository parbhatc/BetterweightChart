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
 *   leftEnd?: "normal" | "arrow",
 *   rightEnd?: "normal" | "arrow",
 *   showMiddlePoint?: boolean,
 *   showPriceLabels?: boolean,
 *   showTimeLabel?: boolean,
 *   statsFields?: Record<string, boolean>,
 *   statsMode?: "hidden" | "on-select" | "always",
 *   statsPosition?: "left" | "center" | "right" | "auto",
 *   statsOffsetX?: number,
 *   statsOffsetY?: number,
 *   alwaysShowStats?: boolean,
 *   angle?: number,
 *   priceOffset?: number,
 *   channelLevels?: { offset: number, enabled: boolean, lineWidth?: number, lineStyle?: number, color?: string, colorOpacity?: number }[],
 *   showChannelBackground?: boolean,
 *   channelBackgroundColor?: string,
 *   channelBackgroundOpacity?: number,
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
