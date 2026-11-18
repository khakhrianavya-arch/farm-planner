// =========================================================
// Settings for this copy of the planner.
// =========================================================

// Firebase web config (from Firebase console → Project settings → Your apps).
// This is not a secret: the database rules decide who can read or change the farm.
// Leave apiKey empty to run in offline mode (saved in this browser only).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// The /beta/ copy is the test version. It works on a separate test farm,
// so trying out a new feature can never touch the real farm.
export const IS_BETA = /\/beta(\/|$)/.test(location.pathname);
export const FARM_ID = IS_BETA ? 'test' : 'main';
export const LIVE_FARM_ID = 'main';
export const APP_VERSION = '2.0.0';
