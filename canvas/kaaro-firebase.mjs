/**
 * canvas/kaaro-firebase.mjs — Shared Kaaro Gateway client identity.
 *
 * Initializes the same Firebase project art-of-intent's frontend uses (this
 * is the public web config — an apiKey here is not a secret, it just
 * identifies the project) and signs in anonymously so kaaroViewer gets a
 * uid it can use with the shared `gatewayCall`/`saveUserSettings` Cloud
 * Functions. See kaaroBrain: 1 Projects/Kaaro Gateway/Shared BYOM Gateway.md
 * for why the gateway lives in art-of-intent's project rather than a new
 * service.
 *
 * Everything here is lazy — nothing runs until ensureKaaroAuth() or
 * getKaaroCallable() is first called, so anyone who never opts into the
 * shared gateway (canvas/settings.mjs's default is local/direct BYOM)
 * triggers zero network calls or Firebase SDK loads.
 */

const firebaseConfig = {
  apiKey: 'AIzaSyCbjBSXYA75T7RWByOk3d10ofoMps145-M',
  authDomain: 'art-of-intent.firebaseapp.com',
  projectId: 'art-of-intent',
  storageBucket: 'art-of-intent.firebasestorage.app',
  messagingSenderId: '401277869938',
  appId: '1:401277869938:web:9d2a35d06e24ff7e8ac7eb',
};

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    })();
  }
  return appPromise;
}

let authReadyPromise = null;

/**
 * Ensure we're signed in (anonymously) to the shared Kaaro Firebase project.
 * Safe to call repeatedly — resolves once with the same uid thereafter.
 * @returns {Promise<string>} uid
 */
export async function ensureKaaroAuth() {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      const [{ getAuth, signInAnonymously }, app] = await Promise.all([
        import('firebase/auth'),
        getApp(),
      ]);
      const auth = getAuth(app);
      if (auth.currentUser) return auth.currentUser.uid;
      const cred = await signInAnonymously(auth);
      return cred.user.uid;
    })();
  }
  return authReadyPromise;
}

/**
 * Get an httpsCallable bound to the shared Kaaro Firebase project's functions.
 * Does NOT sign in for you — call ensureKaaroAuth() first (or let the caller
 * in pipeline/gateway/remote.mjs do it).
 * @param {string} name - callable function name (e.g. 'gatewayCall', 'saveUserSettings')
 */
export async function getKaaroCallable(name) {
  const [{ getFunctions, httpsCallable }, app] = await Promise.all([
    import('firebase/functions'),
    getApp(),
  ]);
  return httpsCallable(getFunctions(app), name);
}
