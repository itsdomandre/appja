/** PostCSS config for Tailwind CSS v4 (Next.js App Router setup — see
 * node_modules/next/dist/docs/01-app/01-getting-started/11-css.md).
 * `package.json` has `"type": "module"`, so this plain `.js` file is
 * already loaded as ESM. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
