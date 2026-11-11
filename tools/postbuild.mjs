// Runs after `vite build` (npm run build, build:poki, build:crazygames), with `--mode <platform>` for portal builds.
// WP-00: nothing to do yet. TODO WP-53: rewrite the service worker precache list, write _headers; WP-52: run
// check-credits so a missing CC-BY credit fails the build.
const at = process.argv.indexOf('--mode');
const mode = at >= 0 ? process.argv[at + 1] : 'local';
console.log(`postbuild (${mode}): nothing to do yet (WP-53).`);
