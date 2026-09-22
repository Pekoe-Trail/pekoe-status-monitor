// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://status.thepekoetrail.org',
  srcDir: './site',
  trailingSlash: 'always',
  build: {
    // No inline <style>, so the Content-Security-Policy can allow styles from 'self' only.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
});
