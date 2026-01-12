import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatUnits } from 'viem';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detects if the application is running in a serverless environment like Netlify
 * @returns boolean indicating if running in serverless environment
 */
export function isServerlessEnvironment(): boolean {
  // Check for Netlify-specific environment variables
  if (typeof process !== 'undefined') {
    return !!(
      process.env.NETLIFY === 'true' ||
      process.env.NEXT_RUNTIME === 'edge' ||
      process.env.VERCEL === '1' ||
      process.env.AWS_LAMBDA_FUNCTION_NAME
    );
  }
  return false;
}

/**
 * Safely formats a value as a string for display, handling various data types
 * @param value The value to format
 * @param decimals Number of decimal places for token formatting
 * @returns Formatted string representation
 */
export function safeFormatValue(value: unknown, decimals: number = 8): string {
  if (value === null || value === undefined) return '0';
  
  try {
    // Handle bigint values
    if (typeof value === 'bigint') {
      return formatUnits(value, decimals);
    }
    
    // Handle string values that represent numbers
    if (typeof value === 'string') {
      // Check if it's a valid number string
      if (/^\d+$/.test(value)) {
        return formatUnits(BigInt(value), decimals);
      }
      return value;
    }
    
    // Handle number values
    if (typeof value === 'number') {
      return formatUnits(BigInt(Math.floor(value)), decimals);
    }
    
    // Handle objects with toString method
    if (typeof value === 'object' && value !== null && 'toString' in value) {
      const stringValue = value.toString();
      if (/^\d+$/.test(stringValue)) {
        return formatUnits(BigInt(stringValue), decimals);
      }
      return stringValue;
    }
    
    return String(value);
  } catch (error) {
    console.warn('Failed to format value:', value, error);
    return '0';
  }
}
