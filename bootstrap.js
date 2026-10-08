import { AuthAPI } from "./auth.js";

document.getElementById("bootstrap-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("bootstrap-btn");
    const email = document.getElementById("bootstrap-email").value.trim();
    const password = document.getElementById("bootstrap-password").value;
    const key = document.getElementById("bootstrap-key").value;

    button.disabled = true;
    button.textContent = "Creating...";
    try {
        await AuthAPI.bootstrapAdmin(email, password, key);
        window.showToast("Initial admin created. Redirecting to admin login.");
        document.getElementById("bootstrap-key").value = "";
        setTimeout(() => { window.location.href = "admin.html"; }, 1200);
    } catch (error) {
        window.showToast(error?.message || "Admin setup failed.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Create Initial Admin";
    }
});
