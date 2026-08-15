import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    {
      name: 'mock-obsidian',
      enforce: 'pre',
      resolveId(source) {
        if (source === 'obsidian') {
          return source;
        }
        return null;
      },
      load(id) {
        if (id === 'obsidian') {
          return `
            export class Notice { constructor(msg) { console.log("Notice:", msg) } }
            export class PluginSettingTab {}
            export class Setting {}
          `;
        }
        return null;
      }
    },
    svelte()
  ],
  server: {
    fs: {
      allow: ['/app']
    }
  }
});
