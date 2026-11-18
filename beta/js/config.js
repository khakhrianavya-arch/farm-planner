// =========================================================
// Settings for this copy of the planner.
// =========================================================

// Firebase web config (from Firebase console → Project settings → Your apps).
// This is not a secret: the database rules decide who can read or change the farm.
// Leave apiKey empty to run in offline mode (saved in this browser only).
export const firebaseConfig = {
  apiKey: "AIzaSyANKQFoiiPaF71-GJd1rKIsCvzSlk6G6RU",
  authDomain: "farm-planner-ddb22.firebaseapp.com",
  projectId: "farm-planner-ddb22",
  storageBucket: "farm-planner-ddb22.firebasestorage.app",
  messagingSenderId: "589107554741",
  appId: "1:589107554741:web:84e41191e318a71f6611fc"
};

// The /beta/ copy is the test version. It works on a separate test farm
// ("test-" + the family code), so trying a new feature can never touch the real farm.
export const IS_BETA = /\/beta(\/|$)/.test(location.pathname);
export const APP_VERSION = '2.1.1';
