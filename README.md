# Baba Plastic — Secure B2B Platform

This project is the generated Baba Plastic B2B Firebase application. It uses Firebase Authentication, Firestore, Cloud Functions, EmailJS and an ImgBB upload proxy.

## Project layout

- `frontend/` — static website and browser-side Firebase SDK code
- `functions/` — server-side Cloud Functions
- `firestore.rules` — hardened Firestore rules
- `firestore.indexes.json` — required Firestore indexes
- `firebase.json` / `.firebaserc` — Firebase deployment configuration

## Security model

- Customer login requires password verification on the server and a one-time email OTP.
- Signup is verified by OTP. The pending password is encrypted before it is stored in the OTP challenge.
- OTPs are stored only as SHA-256 hashes, expire after 5 minutes, have three attempts, are bound to an email/purpose/challenge ID, and are one-time use.
- Password reset is performed by a Cloud Function after OTP verification.
- Admin authorization uses Firebase custom claims (`admin: true`) and locked Firestore rules.
- B2B orders are created only by a Cloud Function. Product status, price and MOQ are read from Firestore on the server, so client-side price/MOQ manipulation does not determine the order total.
- ImgBB credentials are server-only. The browser sends an image to an authenticated admin-only upload proxy.
- No admin privilege is stored in `localStorage` or `sessionStorage`.
- CMS fields rendered into HTML are escaped/sanitized by the frontend helpers.
- The initial admin can be created through `frontend/admin-bootstrap.html`; no manual Firestore admin document creation is required.

## 1. Install

Requirements:

- Node.js 20+
- Firebase CLI

```bash
npm install -g firebase-tools
firebase login
cd Baba-Plastic
cd functions
npm install
cd ..
firebase use default
```

## 2. Configure server secrets

Do not put EmailJS private credentials, ImgBB credentials, OTP encryption keys, or the bootstrap key into frontend source files.

Set the secrets through Firebase Secret Manager:

```bash
firebase functions:secrets:set FIREBASE_API_KEY
firebase functions:secrets:set EMAILJS_SERVICE_ID
firebase functions:secrets:set EMAILJS_CUSTOMER_TEMPLATE
firebase functions:secrets:set EMAILJS_ADMIN_TEMPLATE
firebase functions:secrets:set EMAILJS_PUBLIC_KEY
firebase functions:secrets:set EMAILJS_PRIVATE_KEY
firebase functions:secrets:set IMGBB_API_KEY
firebase functions:secrets:set OTP_ENCRYPTION_KEY
firebase functions:secrets:set BOOTSTRAP_ADMIN_KEY
```

Generate strong random values for the two application secrets:

```bash
openssl rand -base64 32
```

Use one fresh value for `OTP_ENCRYPTION_KEY` and a different fresh value for `BOOTSTRAP_ADMIN_KEY`.

`FIREBASE_API_KEY` is the same public Firebase Web API key used by the frontend configuration. It is placed in Secret Manager here because the backend also needs it for server-side password verification.

## 3. Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

The Functions are deployed to `asia-south1`. The browser Firebase Functions client is configured for the same region.

## 4. Create the first admin — no Firebase Console document editing

After deployment open:

`/admin-bootstrap.html`

Enter:

1. The first admin email.
2. A password of at least 8 characters.
3. The `BOOTSTRAP_ADMIN_KEY` value you configured in Secret Manager.

The backend creates the Firebase Auth user if it does not already exist, grants the `admin: true` custom claim, creates the protected `admins` record, and permanently marks bootstrap as completed.

After this succeeds, use `/admin.html`.

**Important:** the bootstrap endpoint is intentionally one-time. Keep the bootstrap key private.

## 5. EmailJS

The backend expects:

- one customer OTP template
- one admin OTP template
- the EmailJS service ID
- the EmailJS public key
- the EmailJS private/access key

The customer template receives `to_email` and `otp_code`.

The admin template receives `admin_email` and `otp_code`.

## 6. ImgBB

Only the Cloud Function receives `IMGBB_API_KEY`. The frontend never contains this secret.

The admin panel uploads images through `uploadImageProxy`, which checks the Firebase custom admin claim before contacting ImgBB.

## 7. Firestore rules

`firestore.rules` is the authoritative client database policy.

Public reads are limited to CMS/product collections. Admin writes require the Firebase custom claim. Orders and enquiries cannot be created directly from the browser. OTP, rate-limit and bootstrap state collections are completely inaccessible to clients.

## 8. Operational notes

- After changing a custom claim, a fresh Firebase ID token is required. The admin panel forces a token refresh when checking admin access.
- Do not remove the only admin unless another admin has already been created.
- Rotate application secrets if they are ever exposed.
- Do not paste private EmailJS or ImgBB credentials into `frontend/config.js`.
- The Firebase Web API key in `frontend/config.js` is client configuration, not an authorization credential.

## 9. Local development

For a simple static frontend test, serve `frontend/` through a local HTTP server instead of opening HTML files with `file://`.

For Firebase emulator testing, configure the Firebase CLI emulators for Auth, Firestore and Functions before connecting a local frontend.

## 10. Final deployment checklist

- Firebase Authentication email/password provider enabled.
- Firestore database created.
- All listed secrets configured.
- Functions deployed successfully.
- Hosting deployed successfully.
- First admin created through `/admin-bootstrap.html`.
- Admin login OTP received and verified.
- Product creation/editing tested.
- Direct-purchase order tested with a quantity below and above MOQ.
- Password reset tested.
- ImgBB upload tested from the admin panel.

Devloped By -
XNEON Technologies

SRT (Shivansh Ranjan Tripathi)
