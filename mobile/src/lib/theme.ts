// Design tokens ported from the web app (CLAUDE.md "Design tokens" + Swift
// AppBackground). Keep in sync with the web source so both clients match.
export const theme = {
  // Base background colour under the radial gradients.
  bg: 'rgb(5, 6, 8)',

  // Accents
  teal: 'rgb(45, 212, 191)',
  orange: 'rgb(251, 146, 60)',

  // Text
  text: '#ffffff',
  textDim: 'rgba(255, 255, 255, 0.5)',
  textNavInactive: 'rgba(255, 255, 255, 0.55)',

  // Glass / surfaces
  glassBg: 'rgba(255, 255, 255, 0.075)',
  glassBorder: 'rgba(255, 255, 255, 0.09)',

  // Floating bottom nav (matches web BottomNav)
  navBg: 'rgba(38, 38, 42, 0.78)',
  navActivePill: 'rgba(255, 255, 255, 0.13)',

  // Profile button
  profileBg: 'rgba(255, 255, 255, 0.10)',
  profileBorder: 'rgba(255, 255, 255, 0.18)',
} as const;
