import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getSiteSettings } from "./database.js";
import { escapeHtml, safeUrl } from "./utils.js";

window.showToast = (message, type = "success") => {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type} show`;
    toast.textContent = String(message || "");
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

document.addEventListener("DOMContentLoaded", async () => {
    const hamburger = document.getElementById("hamburger");
    const navLinks = document.getElementById("nav-links");

    if (hamburger && navLinks) {
        hamburger.addEventListener("click", () => navLinks.classList.toggle("active"));
    }

    const year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    try {
        const settings = await getSiteSettings();
        if (!settings) return;

        document.querySelectorAll(".cms-site-name").forEach((el) => {
            el.textContent = settings.siteName || "Baba Plastic";
        });
        document.querySelectorAll(".cms-site-phone").forEach((el) => {
            el.textContent = settings.contactPhone || "";
        });
        document.querySelectorAll(".cms-site-email").forEach((el) => {
            el.textContent = settings.contactEmail || "";
        });
        document.querySelectorAll(".cms-site-address").forEach((el) => {
            el.textContent = settings.contactAddress || "";
        });

        if (settings.logoUrl) {
            document.querySelectorAll(".cms-site-logo").forEach((el) => {
                el.textContent = "";
                const img = document.createElement("img");
                img.src = safeUrl(settings.logoUrl, "");
                img.alt = settings.siteName || "Baba Plastic";
                img.style.height = "40px";
                img.style.maxWidth = "180px";
                img.style.objectFit = "contain";
                if (img.src) el.appendChild(img);
                else el.textContent = settings.siteName || "Baba Plastic";
            });
        }
    } catch (error) {
        console.error("CMS Load Error:", error);
    }
});

onAuthStateChanged(auth, async (user) => {
    const authUI = document.getElementById("auth-nav-ui");
    if (!authUI) return;

    if (!user) {
        authUI.innerHTML = '<a href="login.html" class="btn btn-primary">Login / Signup</a>';
        return;
    }

    try {
        const tokenResult = await user.getIdTokenResult();
        const isAdmin = tokenResult.claims.admin === true;

        if (isAdmin && window.location.pathname.endsWith("admin.html")) return;

        authUI.innerHTML = `
            <a href="account.html">My Account</a>
            ${isAdmin ? '<a href="admin.html">Admin Panel</a>' : ""}
            <a href="#" id="logout-btn">Logout</a>
        `;

        document.getElementById("logout-btn")?.addEventListener("click", async (event) => {
            event.preventDefault();
            await signOut(auth);
            window.location.href = "index.html";
        });
    } catch (error) {
        console.error("Auth UI error:", error);
    }
});
