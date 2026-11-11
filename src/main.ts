import { startApp } from './app/app';
import { bootFailed, mark } from './app/boot';

mark('runshift:main');
// Not top-level await: browsers too old to parse it should still reach the boot screen's error message.
startApp().catch(bootFailed);
