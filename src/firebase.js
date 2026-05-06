import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyAl9y6z3QIwDOxjsfCrl3ucZOLI4e7iVl4",
  authDomain:        "careerclub-276f1.firebaseapp.com",
  projectId:         "careerclub-276f1",
  storageBucket:     "careerclub-276f1.firebasestorage.app",
  messagingSenderId: "190098274759",
  appId:             "1:190098274759:web:fca1669abdf4ae881401e2",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db   = getFirestore(app)
