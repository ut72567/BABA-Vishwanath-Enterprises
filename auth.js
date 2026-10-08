import { auth, functions } from "./firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const initiateLoginFn = httpsCallable(functions, "initiateLogin");
const initiateSignupFn = httpsCallable(functions, "initiateSignup");
const initiateAdminLoginFn = httpsCallable(functions, "initiateAdminLogin");
const initiatePasswordResetFn = httpsCallable(functions, "initiatePasswordReset");
const verifyOTPFn = httpsCallable(functions, "verifyOTP");
const bootstrapAdminFn = httpsCallable(functions, "bootstrapAdmin");

export const AuthAPI = {
    async requestLoginOTP(email, password) {
        const result = await initiateLoginFn({ email, password });
        return result.data;
    },
    async requestSignupOTP(email, password) {
        const result = await initiateSignupFn({ email, password });
        return result.data;
    },
    async requestAdminOTP(email, password) {
        const result = await initiateAdminLoginFn({ email, password });
        return result.data;
    },
    async requestResetOTP(email) {
        const result = await initiatePasswordResetFn({ email });
        return result.data;
    },
    async submitOTP(email, otp, purpose, challengeId, newPassword = null) {
        const result = await verifyOTPFn({ email, otp, purpose, challengeId, newPassword });
        if (result.data.token) {
            await signInWithCustomToken(auth, result.data.token);
        }
        return result.data;
    },
    async bootstrapAdmin(email, password, bootstrapKey) {
        const result = await bootstrapAdminFn({ email, password, bootstrapKey });
        return result.data;
    }
};
