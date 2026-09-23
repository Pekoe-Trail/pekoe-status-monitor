// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://status.thepekoetrail.org',
  srcDir: './site',
  trailingSlash: 'never',
  build: {
    // No inline <style>, so the Content-Security-Policy can allow styles from 'self' only.
    inlineStylesheets: 'never',
    format: 'file',
  },
  devToolbar: { enabled: false },
  redirects: {
    '/alerts': '/trail',
  },
});
