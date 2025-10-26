import { extendTheme, ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: '#E3F2FF',
    100: '#B3DAFF',
    200: '#81C2FF',
    300: '#4FAAFF',
    400: '#1D92FF',
    500: '#0478E8',
    600: '#005EB6',
    700: '#004384',
    800: '#002852',
    900: '#000F24',
  },
};

const fonts = {
  heading: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  body: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
};

const components = {
  Button: {
    baseStyle: {
      borderRadius: 'md',
      fontWeight: '600',
    },
    variants: {
      solid: {
        bg: 'brand.500',
        color: 'white',
        _hover: {
          bg: 'brand.400',
        },
        _active: {
          bg: 'brand.600',
        },
      },
      outline: {
        borderColor: 'brand.400',
        color: 'brand.200',
        _hover: {
          bg: 'brand.900',
        },
      },
    },
  },
  Modal: {
    baseStyle: {
      dialog: {
        bg: 'gray.900',
        color: 'whiteAlpha.900',
      },
    },
  },
  Select: {
    baseStyle: {
      field: {
        borderRadius: 'md',
        bg: 'blackAlpha.600',
        _focusVisible: {
          borderColor: 'brand.400',
          boxShadow: '0 0 0 2px rgba(4,120,232,0.6)',
        },
      },
    },
  },
};

const theme = extendTheme({ config, colors, fonts, components });

export default theme;
