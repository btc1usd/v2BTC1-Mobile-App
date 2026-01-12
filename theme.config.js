/** @type {const} */
const themeColors = {
  // Primary orange color matching GitHub repo
  primary: { light: '#F97316', dark: '#FB923C' }, // Orange-500 / Orange-400
  
  // Background colors
  background: { light: '#FAFAFA', dark: '#0F1419' }, // Very light gray / Dark blue-gray
  
  // Surface/Card colors
  surface: { light: '#FFFFFF', dark: '#1A1F2E' }, // Pure white / Slightly lighter dark
  
  // Text colors
  foreground: { light: '#18181B', dark: '#F4F4F5' }, // Dark text / Very light text
  muted: { light: '#71717A', dark: '#A1A1AA' }, // Medium gray / Medium-light gray
  
  // Border colors
  border: { light: '#E4E4E7', dark: '#3F3F46' }, // Light border / Visible dark border
  
  // Status colors
  success: { light: '#22C55E', dark: '#4ADE80' }, // Green-500 / Green-400
  warning: { light: '#F59E0B', dark: '#FBBF24' }, // Amber-500 / Amber-400
  error: { light: '#EF4444', dark: '#F87171' }, // Red-500 / Red-400
  
  // Bitcoin/Gold accent
  bitcoin: { light: '#F97316', dark: '#FB923C' }, // Orange (Bitcoin color)
  gold: { light: '#EAB308', dark: '#FACC15' }, // Yellow-500 / Yellow-400
};

module.exports = { themeColors };
