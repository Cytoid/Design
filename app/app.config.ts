export default defineAppConfig({
  ui: {
    colors: {
      primary: 'violet',
      neutral: 'mist',
    },
    button: {
      defaultVariants: {
        color: 'neutral',
      },
    },
    badge: {
      defaultVariants: {
        color: 'neutral',
      },
    },
  },
  seo: {
    siteName: 'Design.Cytoid',
  },
  header: {
    title: '',
    to: '/',
    logo: {
      alt: '',
      light: '',
      dark: '',
    },
    search: false,
    colorMode: false,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/Cytoid/Design',
      'target': '_blank',
      'aria-label': 'GitHub',
    }],
  },
  footer: {
    credits: `© ${new Date().getFullYear()} Cytoid`,
    colorMode: false,
    links: [{
      'icon': 'i-lucide-house',
      'to': 'https://cytoid.io',
      'target': '_blank',
      'aria-label': 'Cytoid website',
    }, {
      'icon': 'i-simple-icons-discord',
      'to': 'https://discord.gg/cytoid',
      'target': '_blank',
      'aria-label': 'Cytoid on Discord',
    }, {
      'icon': 'i-simple-icons-x',
      'to': 'https://twitter.com/cytoidio',
      'target': '_blank',
      'aria-label': 'Cytoid on X',
    }, {
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/Cytoid',
      'target': '_blank',
      'aria-label': 'Cytoid on GitHub',
    }],
  },
})
