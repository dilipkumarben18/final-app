import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Saree Business App',
    short_name: 'Saree App',
    description: 'Purchases, production, weaver work, stock, sales, and damage tracking',
    start_url: '/',
    display: 'standalone',
    background_color: '#fdf5f0',
    theme_color: '#8f4a1e',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
