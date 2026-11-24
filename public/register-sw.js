if ("serviceWorker" in navigator && window.isSecureContext && !window.chrome?.webview) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Åndehul kunne ikke gemmes til offlinebrug.", error);
    });
  });
}
