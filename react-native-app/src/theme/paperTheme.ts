import { MD3LightTheme } from 'react-native-paper';

/** Shared TrackRunner roles for the mobile field workspace. */
export const runnerTheme = {
  colors: {
    background: '#FAF5F1', surface: '#FFFFFF', surfaceMuted: '#F3F0ED', outline: '#E5E1DC',
    text: '#102038', muted: '#5E6A69', brand: '#003766', brandSoft: '#E8F0F6', accent: '#FF7F5A',
    success: '#1F7A5A', successSoft: '#E6F4EF', warning: '#9A5A14', warningSoft: '#FFF1DC',
    danger: '#B8432B', dangerSoft: '#FDE9E4',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
} as const;

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#003766',
    secondary: '#5E6A69',
    tertiary: '#1F7A5A',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    background: '#FAF5F1',
    error: '#B8432B',
  },
};
