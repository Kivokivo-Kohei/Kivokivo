import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAjFh9F45NXSi_bM7I4zm7l-14V_AZZi18",
  authDomain: "kivo-cafe.firebaseapp.com",
  projectId: "kivo-cafe",
  storageBucket: "kivo-cafe.firebasestorage.app",
  messagingSenderId: "49675640640",
  appId: "1:49675640640:web:3447a2f9a758ec92cb64a5",
};

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);