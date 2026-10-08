import { auth } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const AuthAPI = {

    async login(email, password) {
        const result = await signInWithEmailAndPassword(
            auth,
            email.trim(),
            password
        );

        return result.user;
    },

    async signup(email, password) {
        const result = await createUserWithEmailAndPassword(
            auth,
            email.trim(),
            password
        );

        return result.user;
    },

    async resetPassword(email) {
        await sendPasswordResetEmail(
            auth,
            email.trim()
        );
    },

    async logout() {
        await signOut(auth);
    }
};
