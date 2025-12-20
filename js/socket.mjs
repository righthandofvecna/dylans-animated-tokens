import { MODULENAME } from "./utils.mjs";

export function current() {
  return game.modules.get(MODULENAME).soc;
}

export function registerSocket(name, fn) {
  const socket = current();
  if (typeof socket !== "object") {
    game.modules.get(MODULENAME).socketFunctions ??= [];
    game.modules.get(MODULENAME).socketFunctions.push({ name, fn });
    return;
  }
  socket.register(name, fn);
}

Hooks.once("socketlib.ready", () => {
  const socket = socketlib.registerModule(MODULENAME);
  game.modules.get(MODULENAME).soc = socket;
  (game.modules.get(MODULENAME).socketFunctions ?? []).forEach(({ name, fn })=>{
    socket.register(name, fn);
  });
});


export function register() {}
