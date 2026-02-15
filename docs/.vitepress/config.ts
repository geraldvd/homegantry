import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'HomeGantry',
  description: 'Auto-discovering Docker homelab dashboard',
  ignoreDeadLinks: [/^https?:\/\/localhost/],
  head: [
    [
      'link',
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏗️</text></svg>",
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'GitHub', link: 'https://github.com/geraldvd/homegantry' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is HomeGantry?', link: '/guide/what-is-homegantry' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Environment Variables', link: '/guide/configuration' },
          { text: 'Docker Labels', link: '/guide/docker-labels' },
          { text: 'Traefik Integration', link: '/guide/traefik' },
          { text: 'Stack Management', link: '/guide/stacks' },
        ],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Docker Compose', link: '/guide/deployment' },
          { text: 'Reverse Proxy', link: '/guide/reverse-proxy' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Contributing', link: '/guide/contributing' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/geraldvd/homegantry' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present HomeGantry Contributors',
    },

    search: {
      provider: 'local',
    },
  },
});
