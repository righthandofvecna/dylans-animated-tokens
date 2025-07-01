

function OnCanvasReady(cnvs) {
  try {
    cnvs?.tokens?.objects?.children?.forEach(o=>o?.startIdleAnimation?.());
  } catch (e) {
    console.error("OnCanvasReady():", e);
  }
}

// When a new token is dropped on the canvas, start its idle animation
function OnCreateToken(token) {
  try {
    setTimeout(()=>token?.object?.startIdleAnimation?.(), 200);
  } catch (e) {
    console.error("OnCreateToken():", e);
  }
}



export function register() {
  Hooks.on("canvasReady", OnCanvasReady);
  Hooks.on("createToken", OnCreateToken);
}
