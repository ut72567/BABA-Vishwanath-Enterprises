const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 20 });

const db = getFirestore();
const auth = getAuth();

const FIREBASE_API_KEY = defineSecret("FIREBASE_API_KEY");
const EMAILJS_SERVICE_ID = defineSecret("EMAILJS_SERVICE_ID");
const EMAILJS_CUSTOMER_TEMPLATE = defineSecret("EMAILJS_CUSTOMER_TEMPLATE");
const EMAILJS_ADMIN_TEMPLATE = defineSecret("EMAILJS_ADMIN_TEMPLATE");
const EMAILJS_PUBLIC_KEY = defineSecret("EMAILJS_PUBLIC_KEY");
const EMAILJS_PRIVATE_KEY = defineSecret("EMAILJS_PRIVATE_KEY");
const IMGBB_API_KEY = defineSecret("IMGBB_API_KEY");
const OTP_ENCRYPTION_KEY = defineSecret("OTP_ENCRYPTION_KEY");
const BOOTSTRAP_ADMIN_KEY = defineSecret("BOOTSTRAP_ADMIN_KEY");

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_COOLDOWN_MS = 60 * 1000;
const MAX_ORDER_ITEMS = 50;

function normalizeEmail(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
}

function assertString(value, name, min = 1, max = 500) {
    if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
        throw new Error(`${name} is invalid.`);
    }
    return value.trim();
}

function assertPassword(value) {
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
        throw new Error("Password must be 8-128 characters.");
    }
    return value;
}

function getEncryptionKey() {
    const raw = OTP_ENCRYPTION_KEY.value();
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("OTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    return key;
}

function encryptSecret(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
        ciphertext: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64")
    };
}

function decryptSecret(payload) {
    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(payload.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final()
    ]).toString("utf8");
}

function hashValue(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function hashOtp(otp) {
    return hashValue(otp);
}

function genericOtpError() {
    return new Error("OTP is invalid or expired.");
}

async function sendEmailJSOTP(email, otp, type) {
    const isAdmin = type === "admin";
    const templateId = isAdmin
        ? EMAILJS_ADMIN_TEMPLATE.value()
        : EMAILJS_CUSTOMER_TEMPLATE.value();

    const templateParams = isAdmin
        ? { admin_email: email, otp_code: otp }
        : { to_email: email, otp_code: otp };

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID.value(),
            template_id: templateId,
            user_id: EMAILJS_PUBLIC_KEY.value(),
            accessToken: EMAILJS_PRIVATE_KEY.value(),
            template_params: templateParams
        })
    });

    if (!response.ok) {
        throw new Error("Email dispatch failed.");
    }
}

async function checkAndCreateRateLimit(email) {
    const rateRef = db.collection("_otp_rate_limits").doc(hashValue(email));
    const now = Date.now();

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(rateRef);
        if (snap.exists) {
            const nextAllowedAt = Number(snap.data().nextAllowedAt || 0);
            if (nextAllowedAt > now) {
                const error = new Error("Please wait before requesting another OTP.");
                error.code = "resource-exhausted";
                throw error;
            }
        }

        tx.set(rateRef, {
            nextAllowedAt: now + OTP_COOLDOWN_MS,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

async function createOTPChallenge(email, purpose, sessionData = {}) {
    await checkAndCreateRateLimit(email);

    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomBytes(24).toString("hex");
    const payload = {
        email,
        purpose,
        hash: hashOtp(otp),
        createdAt: Date.now(),
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0
    };

    if (sessionData.pendingPassword) {
        payload.pendingPassword = encryptSecret(sessionData.pendingPassword);
    }

    const safeSessionData = { ...sessionData };
    delete safeSessionData.pendingPassword;
    Object.assign(payload, safeSessionData);

    await db.collection("_secure_otps").doc(challengeId).set(payload);
    return { otp, challengeId };
}

function toHttpsError(code, message) {
    const { HttpsError } = require("firebase-functions/v2/https");
    return new HttpsError(code, message);
}

async function verifyPassword(email, password) {
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY.value())}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true
            })
        }
    );

    const data = await response.json();
    if (!response.ok || data.error) {
        throw toHttpsError("unauthenticated", "Email and password is incorrect.");
    }
    return data;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

exports.initiateLogin = onCall(
    { secrets: [FIREBASE_API_KEY, EMAILJS_SERVICE_ID, EMAILJS_CUSTOMER_TEMPLATE, EMAILJS_ADMIN_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);
        const password = request.data?.password;

        if (!validateEmail(email) || typeof password !== "string") {
            throw toHttpsError("invalid-argument", "Invalid credentials.");
        }

        await verifyPassword(email, password);
        try {
            const { otp, challengeId } = await createOTPChallenge(email, "login");
            await sendEmailJSOTP(email, otp, "login");
            return { success: true, challengeId };
        } catch (error) {
            if (error.code === "resource-exhausted") {
                throw toHttpsError("resource-exhausted", error.message);
            }
            throw toHttpsError("internal", "Unable to send OTP.");
        }
    }
);

exports.initiateSignup = onCall(
    { secrets: [EMAILJS_SERVICE_ID, EMAILJS_CUSTOMER_TEMPLATE, EMAILJS_ADMIN_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, OTP_ENCRYPTION_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);
        const password = request.data?.password;

        if (!validateEmail(email)) throw toHttpsError("invalid-argument", "Invalid email.");
        try {
            assertPassword(password);
        } catch (error) {
            throw toHttpsError("invalid-argument", error.message);
        }

        try {
            await auth.getUserByEmail(email);
            throw toHttpsError("already-exists", "User already registered.");
        } catch (error) {
            if (error.code !== "auth/user-not-found") {
                if (error instanceof Error && error.message === "User already registered.") throw error;
                throw error;
            }
        }

        try {
            const { otp, challengeId } = await createOTPChallenge(email, "signup", {
                pendingPassword: password
            });
            await sendEmailJSOTP(email, otp, "signup");
            return { success: true, challengeId };
        } catch (error) {
            if (error.code === "resource-exhausted") {
                throw toHttpsError("resource-exhausted", error.message);
            }
            throw toHttpsError("internal", "Unable to send OTP.");
        }
    }
);

exports.initiateAdminLogin = onCall(
    { secrets: [FIREBASE_API_KEY, EMAILJS_SERVICE_ID, EMAILJS_CUSTOMER_TEMPLATE, EMAILJS_ADMIN_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);
        const password = request.data?.password;

        if (!validateEmail(email) || typeof password !== "string") {
            throw toHttpsError("invalid-argument", "Invalid credentials.");
        }

        await verifyPassword(email, password);

        const adminDoc = await db.collection("admins").doc(email).get();
        if (!adminDoc.exists) {
            throw toHttpsError("permission-denied", "Unauthorized.");
        }

        try {
            const { otp, challengeId } = await createOTPChallenge(email, "admin");
            await sendEmailJSOTP(email, otp, "admin");
            return { success: true, challengeId };
        } catch (error) {
            if (error.code === "resource-exhausted") {
                throw toHttpsError("resource-exhausted", error.message);
            }
            throw toHttpsError("internal", "Unable to send OTP.");
        }
    }
);

exports.initiatePasswordReset = onCall(
    { secrets: [EMAILJS_SERVICE_ID, EMAILJS_CUSTOMER_TEMPLATE, EMAILJS_ADMIN_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);

        if (validateEmail(email)) {
            try {
                await auth.getUserByEmail(email);
                const { otp, challengeId } = await createOTPChallenge(email, "reset");
                await sendEmailJSOTP(email, otp, "reset");
                return { success: true, challengeId };
            } catch (_) {
                // Intentionally silent to prevent account enumeration.
            }
        }

        return { success: true };
    }
);

exports.verifyOTP = onCall(
    { secrets: [OTP_ENCRYPTION_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);
        const otp = typeof request.data?.otp === "string" ? request.data.otp.trim() : "";
        const purpose = request.data?.purpose;
        const challengeId = request.data?.challengeId;
        const newPassword = request.data?.newPassword;

        if (!validateEmail(email) || !/^\d{6}$/.test(otp) || typeof challengeId !== "string" || challengeId.length !== 48) {
            throw toHttpsError("invalid-argument", "Invalid OTP request.");
        }

        const otpRef = db.collection("_secure_otps").doc(challengeId);
        const snap = await otpRef.get();
        if (!snap.exists) throw toHttpsError("not-found", "OTP expired or invalid.");

        const session = snap.data();
        if (session.email !== email || session.purpose !== purpose) {
            throw toHttpsError("unauthenticated", genericOtpError().message);
        }

        if (Date.now() > Number(session.expiresAt)) {
            await otpRef.delete();
            throw toHttpsError("deadline-exceeded", "OTP expired.");
        }

        if (Number(session.attempts || 0) >= OTP_MAX_ATTEMPTS) {
            await otpRef.delete();
            throw toHttpsError("permission-denied", "Maximum OTP attempts reached.");
        }

        const valid = crypto.timingSafeEqual(
            Buffer.from(hashOtp(otp), "hex"),
            Buffer.from(session.hash, "hex")
        );

        if (!valid) {
            const attempts = Number(session.attempts || 0) + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                await otpRef.delete();
                throw toHttpsError("permission-denied", "Maximum OTP attempts reached.");
            }
            await otpRef.update({ attempts });
            throw toHttpsError("unauthenticated", "Invalid OTP.");
        }

        await otpRef.delete();

        if (purpose === "signup") {
            let password;
            try {
                password = decryptSecret(session.pendingPassword);
            } catch (_) {
                throw toHttpsError("internal", "Signup challenge is invalid.");
            }

            try {
                const user = await auth.createUser({ email, password });
                const token = await auth.createCustomToken(user.uid);
                return { token };
            } catch (error) {
                if (error.code === "auth/email-already-exists") {
                    throw toHttpsError("already-exists", "User already registered.");
                }
                throw toHttpsError("internal", "Unable to create account.");
            }
        }

        if (purpose === "login") {
            const user = await auth.getUserByEmail(email);
            return { token: await auth.createCustomToken(user.uid) };
        }

        if (purpose === "admin") {
            const user = await auth.getUserByEmail(email);
            await auth.setCustomUserClaims(user.uid, { admin: true });
            return { token: await auth.createCustomToken(user.uid) };
        }

        if (purpose === "reset") {
            try {
                assertPassword(newPassword);
            } catch (error) {
                throw toHttpsError("invalid-argument", error.message);
            }
            const user = await auth.getUserByEmail(email);
            await auth.updateUser(user.uid, { password: newPassword });
            return { success: true };
        }

        throw toHttpsError("invalid-argument", "Unknown OTP purpose.");
    }
);

function validateOrderItem(item) {
    if (!item || typeof item.productId !== "string" || item.productId.length > 200) {
        throw toHttpsError("invalid-argument", "Invalid product.");
    }
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty <= 0) {
        throw toHttpsError("invalid-argument", "Invalid quantity.");
    }
    return { productId: item.productId, qty };
}

exports.createB2BOrder = onCall(async (request) => {
    if (!request.auth) throw toHttpsError("unauthenticated", "Login required.");

    const items = request.data?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
        throw toHttpsError("invalid-argument", "Invalid cart.");
    }

    let companyName, phone, deliveryAddress;
    try {
        companyName = assertString(request.data.companyName, "Company name", 2, 150);
        phone = assertString(request.data.phone, "Phone", 5, 30);
        deliveryAddress = assertString(request.data.deliveryAddress, "Delivery address", 5, 1000);
    } catch (error) {
        throw toHttpsError("invalid-argument", error.message);
    }

    const validatedItems = [];
    let totalAmount = 0;
    const seen = new Set();

    for (const rawItem of items) {
        const item = validateOrderItem(rawItem);
        if (seen.has(item.productId)) throw toHttpsError("invalid-argument", "Duplicate product.");
        seen.add(item.productId);

        const pDoc = await db.collection("products").doc(item.productId).get();
        if (!pDoc.exists) throw toHttpsError("not-found", "Product missing.");

        const p = pDoc.data();
        const price = Number(p.price);
        const moq = Number(p.moq);

        if (p.status !== "direct_purchase") {
            throw toHttpsError("failed-precondition", "This item is not available for direct purchase.");
        }
        if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(moq) || moq <= 0) {
            throw toHttpsError("failed-precondition", "Product configuration is invalid.");
        }
        if (item.qty < moq) {
            throw toHttpsError("failed-precondition", `Minimum order quantity is ${moq}.`);
        }

        const lineTotal = price * item.qty;
        if (!Number.isFinite(lineTotal) || lineTotal > Number.MAX_SAFE_INTEGER) {
            throw toHttpsError("failed-precondition", "Order value is too large.");
        }

        totalAmount += lineTotal;
        validatedItems.push({
            productId: item.productId,
            name: typeof p.name === "string" ? p.name : "Product",
            qty: item.qty,
            unitPrice: price,
            moq
        });
    }

    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw toHttpsError("failed-precondition", "Invalid order total.");
    }

    const order = {
        customerId: request.auth.uid,
        customerEmail: request.auth.token.email || "",
        companyName,
        phone,
        deliveryAddress,
        items: validatedItems,
        totalAmount,
        status: "new",
        adminNotes: "",
        createdAt: FieldValue.serverTimestamp()
    };

    const ref = await db.collection("orders").add(order);
    return { orderId: ref.id };
});

exports.submitEnquiry = onCall(async (request) => {
    const data = request.data || {};
    let productId, companyName, phone, email, message, qty;

    try {
        productId = assertString(data.productId || "General Contact", "Product", 1, 200);
        companyName = assertString(data.companyName, "Company name", 2, 150);
        phone = assertString(data.phone, "Phone", 5, 30);
        email = normalizeEmail(data.email || request.auth?.token?.email || "");
        message = assertString(data.message, "Message", 2, 2000);
        qty = Number.isFinite(Number(data.qty)) ? Math.max(0, Math.floor(Number(data.qty))) : 0;
    } catch (error) {
        throw toHttpsError("invalid-argument", error.message);
    }

    if (email && !validateEmail(email)) {
        throw toHttpsError("invalid-argument", "Invalid email.");
    }

    await db.collection("enquiries").add({
        productId,
        qty,
        companyName,
        phone,
        email,
        message,
        customerId: request.auth?.uid || null,
        status: "pending",
        createdAt: FieldValue.serverTimestamp()
    });

    return { success: true };
});

exports.uploadImageProxy = onCall(
    { secrets: [IMGBB_API_KEY] },
    async (request) => {
        if (!request.auth || request.auth.token.admin !== true) {
            throw toHttpsError("permission-denied", "Admin only.");
        }

        const base64Image = request.data?.base64Image;
        if (typeof base64Image !== "string" || !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(base64Image)) {
            throw toHttpsError("invalid-argument", "Invalid image.");
        }

        const raw = base64Image.split(",", 2)[1];
        if (!raw || raw.length > 8 * 1024 * 1024) {
            throw toHttpsError("invalid-argument", "Image is too large.");
        }

        const body = new URLSearchParams({ image: raw });
        const response = await fetch(
            `https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY.value())}`,
            { method: "POST", body }
        );
        const result = await response.json();

        if (response.ok && result.success && result.data?.url) {
            return { url: result.data.url };
        }

        throw toHttpsError("internal", "Image upload failed.");
    }
);

exports.manageAdmin = onCall(async (request) => {
    if (!request.auth || request.auth.token.admin !== true) {
        throw toHttpsError("permission-denied", "Admin only.");
    }

    const email = normalizeEmail(request.data?.email);
    const action = request.data?.action;

    if (!validateEmail(email) || !["add", "remove"].includes(action)) {
        throw toHttpsError("invalid-argument", "Invalid admin request.");
    }

    if (action === "add") {
        const user = await auth.getUserByEmail(email);
        await db.collection("admins").doc(email).set({
            uid: user.uid,
            createdAt: FieldValue.serverTimestamp()
        });
        await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
        return { success: true };
    }

    if (email === normalizeEmail(request.auth.token.email)) {
        throw toHttpsError("failed-precondition", "You cannot remove your own admin access.");
    }

    const docRef = db.collection("admins").doc(email);
    await docRef.delete().catch(() => {});
    try {
        const user = await auth.getUserByEmail(email);
        const claims = { ...(user.customClaims || {}) };
        delete claims.admin;
        await auth.setCustomUserClaims(user.uid, claims);
    } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
    }

    return { success: true };
});

exports.bootstrapAdmin = onCall(
    { secrets: [BOOTSTRAP_ADMIN_KEY] },
    async (request) => {
        const email = normalizeEmail(request.data?.email);
        const password = request.data?.password;
        const bootstrapKey = typeof request.data?.bootstrapKey === "string" ? request.data.bootstrapKey : "";

        if (!validateEmail(email)) throw toHttpsError("invalid-argument", "Invalid email.");
        try {
            assertPassword(password);
        } catch (error) {
            throw toHttpsError("invalid-argument", error.message);
        }

        if (!bootstrapKey || bootstrapKey.length < 20) {
            throw toHttpsError("permission-denied", "Invalid bootstrap key.");
        }

        const expected = Buffer.from(BOOTSTRAP_ADMIN_KEY.value(), "utf8");
        const supplied = Buffer.from(bootstrapKey, "utf8");
        if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
            throw toHttpsError("permission-denied", "Invalid bootstrap key.");
        }

        const bootstrapRef = db.collection("_system").doc("bootstrap");
        const operationId = crypto.randomBytes(16).toString("hex");
        const now = Date.now();

        await db.runTransaction(async (tx) => {
            const state = await tx.get(bootstrapRef);
            if (state.exists) {
                const data = state.data();
                if (data.status === "completed") {
                    throw toHttpsError("already-exists", "Initial admin bootstrap has already been completed.");
                }
                if (data.status === "locked" && now - Number(data.lockedAt || 0) < 10 * 60 * 1000) {
                    throw toHttpsError("resource-exhausted", "Admin bootstrap is already in progress.");
                }
            }

            tx.set(bootstrapRef, {
                status: "locked",
                lockedAt: now,
                operationId
            });
        });

        let user;
        try {
            try {
                user = await auth.getUserByEmail(email);
            } catch (error) {
                if (error.code !== "auth/user-not-found") throw error;
                user = await auth.createUser({ email, password });
            }

            await auth.updateUser(user.uid, { password });
            await auth.setCustomUserClaims(user.uid, {
                ...(user.customClaims || {}),
                admin: true
            });

            await db.collection("admins").doc(email).set({
                uid: user.uid,
                createdAt: FieldValue.serverTimestamp(),
                bootstrapped: true
            });

            await bootstrapRef.set({
                status: "completed",
                completedAt: FieldValue.serverTimestamp(),
                adminEmail: email
            });

            return { success: true };
        } catch (error) {
            const current = await bootstrapRef.get();
            if (current.exists && current.data().operationId === operationId) {
                await bootstrapRef.delete().catch(() => {});
            }
            if (error.code === "permission-denied" || error.code === "already-exists") throw error;
            throw toHttpsError("internal", "Unable to create the initial admin.");
        }
    }
);

