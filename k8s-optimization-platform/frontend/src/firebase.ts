import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDBqGOhvESUPN6qD-BT6TE1pv8Q6X6CMSM",
  authDomain: "k8s-6d5ba.firebaseapp.com",
  projectId: "k8s-6d5ba",
  storageBucket: "k8s-6d5ba.firebasestorage.app",
  messagingSenderId: "711967098180",
  appId: "1:711967098180:web:4e03a9e449d056cf008311",
  measurementId: "G-X870ZRG8M7",
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export default app;
