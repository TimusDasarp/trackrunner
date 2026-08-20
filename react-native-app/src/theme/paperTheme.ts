import { MD3LightTheme } from 'react-native-paper';

/** Shared runner-app tokens used by the task dashboard. */
export const runnerTheme = {
  colors: {
    background: '#050908',
    surface: '#0D151C',
    surfaceRaised: '#111B24',
    outline: '#263B4C',
    text: '#F8FAFC',
    muted: '#9AA7B8',
    blue: '#1496FF',
    green: '#2DE26D',
    greenSurface: '#0F2D23',
    urgent: '#FF4D5B',
    urgentSurface: '#261719',
    high: '#F4B740',
    pill: '#252A32',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
} as const;

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2563EB',
    secondary: '#475569',
    tertiary: '#0F766E',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    background: '#F8FAFC',
    error: '#B91C1C',
  },
};
