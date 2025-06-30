import { MODULENAME } from './utils.mjs';
import { VERSION } from './version.mjs';

export function register() {
  Hooks.on("ready", ()=>{
    // Check version
    if (game.modules.get(MODULENAME).version !== VERSION) {
      const isMac = (()=>{
        try {
          return navigator?.userAgentData?.platform?.includes("Mac") ?? navigator?.platform?.includes("Mac");
        } catch {
          return false;
        }
      })()
      const keyCombo = isMac ? "⌘ + Shift + R" : "Ctrl + F5";
      ui.notifications.error(`Dylan's Animated Tokens: Your browser cache appears to be out of date. Please reload the page using ${keyCombo} to ensure the module behaves as expected.`, { permanent: true});
    }
  });
}