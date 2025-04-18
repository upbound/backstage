import {
    createBaseThemeOptions,
    createUnifiedTheme,
    genPageTheme,
    defaultTypography,
    palettes,
    shapes,
  } from '@backstage/theme';
  
  export const upboundTheme = createUnifiedTheme({
    ...createBaseThemeOptions({
      palette: {
        ...palettes.light,
        primary: {
          main: '#030724',
        },
        secondary: {
          main: '#565a6e',
        },
        error: {
          main: '#8c4351',
        },
        warning: {
          main: '#8f5e15',
        },
        info: {
          main: '#34548a',
        },
        success: {
          main: '#485e30',
        },
        background: {
          default: '#f8f9f9',
          paper: '#ffffff',
        },
        banner: {
          info: '#34548a',
          error: '#8c4351',
          text: '#343b58',
          link: '#565a6e',
        },
        errorBackground: '#8c4351',
        warningBackground: '#8f5e15',
        infoBackground: '#343b58',
        navigation: {
          background: '#f2f2f4',
          indicator: '#030724',
          color: '#21253e',
          selectedColor: '#21253e',
          navItem: {  
            hoverBackground: '#ffffff',  
          }
        },
      },
    }),
    typography: {
        ...defaultTypography,
        htmlFontSize: 16,
        fontFamily: 'Avenir, Arial, sans-serif',
        h1: {
          fontSize: 72,
          fontWeight: 700,
          marginBottom: 10,
        },
      },
    defaultPageTheme: 'home',
    /* below drives the header colors */
    pageTheme: {
      home: genPageTheme({ colors: ['#030724'], shape: 'none' }),
    },
    components: {
      },
  });