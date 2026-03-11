// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs",
  authDomain: "at-map-tmc.firebaseapp.com",
  projectId: "at-map-tmc",
  storageBucket: "at-map-tmc.firebasestorage.app",
  messagingSenderId: "862190385314",
  appId: "1:862190385314:web:f7fbf6a9eed1061231fffb",
  measurementId: "G-90GYNPFF82"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LckRIcsAAAAABtcx9DepGiprCzFv_ex-5imoKGl"),
  isTokenAutoRefreshEnabled: true
});
const analytics = getAnalytics(app);