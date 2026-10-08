import { auth, db, functions } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection, getDocs, getDoc, doc, setDoc, addDoc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { AuthAPI } from "./auth.js";
import { uploadToImgBB } from "./imgbb.js";
import { escapeHtml, safeUrl, formatTimestamp } from "./utils.js";

let isAdminSession = false;
let adminChallengeId = "";
let cachedProducts = new Map();
let cachedOrders = new Map();

const $ = (id) => document.getElementById(id);

document.querySelectorAll(".admin-menu a[data-tab]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
        event.preventDefault();
        document.querySelectorAll(".admin-menu a[data-tab]").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
        tab.classList.add("active");
        $(tab.dataset.tab)?.classList.add("active");
    });
});

$("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("a-login-btn");
    const email = $("a-email").value.trim();
    const password = $("a-password").value;

    button.disabled = true;
    button.textContent = "Verifying...";
    try {
        const result = await AuthAPI.requestAdminOTP(email, password);
        adminChallengeId = result.challengeId || "";
        $("admin-login-form").style.display = "none";
        $("admin-otp-form").style.display = "block";
        window.showToast("OTP sent to the admin email.");
    } catch (error) {
        window.showToast(error?.message || "Unauthorized or error.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Secure Login";
    }
});

$("admin-otp-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("a-verify-btn");
    const email = $("a-email").value.trim();
    const otp = $("a-otp").value.trim();

    button.disabled = true;
    try {
        await AuthAPI.submitOTP(email, otp, "admin", adminChallengeId);
        window.showToast("Admin login successful.");
    } catch (error) {
        window.showToast(error?.message || "Verification failed.", "error");
        button.disabled = false;
    }
});

$("admin-logout").addEventListener("click", async (event) => {
    event.preventDefault();
    await signOut(auth);
    window.location.reload();
});

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const token = await user.getIdTokenResult(true);
        if (token.claims.admin !== true) {
            window.showToast("Not authorized.", "error");
            await signOut(auth);
            return;
        }

        isAdminSession = true;
        $("admin-auth-overlay").style.display = "none";
        $("admin-dashboard-layout").style.display = "flex";
        await loadAdminData();
    } catch (error) {
        console.error(error);
        window.showToast("Unable to verify admin session.", "error");
        await signOut(auth);
    }
});

async function loadAdminData() {
    if (!isAdminSession) return;

    try {
        const [productsSnap, ordersSnap, catsSnap, settingsSnap, adminsSnap] = await Promise.all([
            getDocs(collection(db, "products")),
            getDocs(collection(db, "orders")),
            getDocs(collection(db, "categories")),
            getDoc(doc(db, "siteSettings", "main")),
            getDocs(collection(db, "admins"))
        ]);

        cachedProducts = new Map(productsSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
        cachedOrders = new Map(ordersSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));

        $("stat-prods").textContent = String(productsSnap.size);
        $("stat-orders").textContent = String(ordersSnap.size);

        $("admin-products-table").querySelector("tbody").innerHTML = productsSnap.docs.map((item) => {
            const p = item.data();
            return `<tr>
                <td><img src="${safeUrl(p.images?.[0], "https://via.placeholder.com/50")}" width="40" height="40" style="object-fit:cover;border-radius:4px;" alt=""></td>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.sku)}</td>
                <td>${escapeHtml(p.category)}</td>
                <td>${escapeHtml(p.status)}</td>
                <td>
                    <button class="action-btn" type="button" data-edit-product="${escapeHtml(item.id)}">Edit</button>
                    <button class="action-btn delete" type="button" data-delete-product="${escapeHtml(item.id)}">Delete</button>
                </td>
            </tr>`;
        }).join("") || '<tr><td colspan="6">No products.</td></tr>';

        $("admin-orders-table").querySelector("tbody").innerHTML = ordersSnap.docs.map((item) => {
            const o = item.data();
            return `<tr>
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(o.companyName)}</td>
                <td>₹${escapeHtml(o.totalAmount)}</td>
                <td>${escapeHtml(o.status)}</td>
                <td><button class="action-btn" type="button" data-view-order="${escapeHtml(item.id)}">View</button></td>
            </tr>`;
        }).join("") || '<tr><td colspan="5">No orders.</td></tr>';

        $("admin-cats-table").querySelector("tbody").innerHTML = catsSnap.docs.map((item) => {
            const c = item.data();
            return `<tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.displayOrder ?? 0)}</td>
                <td><button class="action-btn delete" type="button" data-delete-category="${escapeHtml(item.id)}">Delete</button></td>
            </tr>`;
        }).join("") || '<tr><td colspan="3">No categories.</td></tr>';

        $("pm-category").innerHTML = catsSnap.docs
            .sort((a,b) => Number(a.data().displayOrder || 0) - Number(b.data().displayOrder || 0))
            .map((item) => `<option value="${escapeHtml(item.data().name)}">${escapeHtml(item.data().name)}</option>`)
            .join("");

        if (settingsSnap.exists()) {
            const settings = settingsSnap.data();
            $("cms-sitename").value = settings.siteName || "";
            $("cms-phone").value = settings.contactPhone || "";
            $("cms-email").value = settings.contactEmail || "";
            $("cms-address").value = settings.contactAddress || "";
            $("cms-hours").value = settings.workingHours || "";
        }

        $("admin-users-table").querySelector("tbody").innerHTML = adminsSnap.docs.map((item) => `
            <tr>
                <td>${escapeHtml(item.id)}</td>
                <td><button class="action-btn delete" type="button" data-remove-admin="${escapeHtml(item.id)}">Revoke</button></td>
            </tr>
        `).join("") || '<tr><td colspan="2">No admins.</td></tr>';
    } catch (error) {
        console.error(error);
        window.showToast("Unable to load admin data.", "error");
    }
}

$("admin-products-table").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editProduct;
    const deleteId = event.target.dataset.deleteProduct;
    if (editId) window.editProduct(editId);
    if (deleteId) await window.deleteDocHandler("products", deleteId);
});

$("admin-orders-table").addEventListener("click", (event) => {
    const orderId = event.target.dataset.viewOrder;
    if (orderId) window.viewOrder(orderId);
});

$("admin-cats-table").addEventListener("click", async (event) => {
    const id = event.target.dataset.deleteCategory;
    if (id) await window.deleteDocHandler("categories", id);
});

$("admin-users-table").addEventListener("click", async (event) => {
    const email = event.target.dataset.removeAdmin;
    if (email) await window.removeAdmin(email);
});

window.openProductModal = () => {
    $("product-form").reset();
    $("pm-id").value = "";
    $("pm-image-url").value = "";
    $("pm-title").textContent = "Add Product";
    $("product-modal").style.display = "flex";
};

window.editProduct = (id) => {
    const product = cachedProducts.get(id);
    if (!product) return window.showToast("Product not found.", "error");

    $("pm-id").value = product.id;
    $("pm-name").value = product.name || "";
    $("pm-sku").value = product.sku || "";
    $("pm-category").value = product.category || "";
    $("pm-status").value = product.status || "direct_purchase";
    $("pm-price").value = Number(product.price || 0);
    $("pm-moq").value = Number(product.moq || 1);
    $("pm-image-url").value = product.images?.[0] || "";
    $("pm-shortDesc").value = product.shortDesc || "";
    $("pm-title").textContent = "Edit Product";
    $("product-modal").style.display = "flex";
};

window.openCatModal = async () => {
    const name = prompt("Category name:");
    if (!name || !name.trim()) return;

    const displayOrder = Number(prompt("Display order:", "0"));
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) {
        return window.showToast("Invalid display order.", "error");
    }

    try {
        await addDoc(collection(db, "categories"), {
            name: name.trim().slice(0, 100),
            displayOrder,
            createdAt: new Date()
        });
        window.showToast("Category added.");
        await loadAdminData();
    } catch (error) {
        window.showToast("Failed to add category.", "error");
    }
};

$("pm-image-upload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) {
        event.target.value = "";
        return window.showToast("Choose an image under 6 MB.", "error");
    }

    window.showToast("Uploading image securely...");
    try {
        const url = await uploadToImgBB(file);
        $("pm-image-url").value = url;
        window.showToast("Upload complete.");
    } catch (error) {
        window.showToast("Upload failed.", "error");
    }
});

$("product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdminSession) return;

    const button = $("pm-save-btn");
    button.disabled = true;

    try {
        const id = $("pm-id").value.trim();
        const name = $("pm-name").value.trim();
        const sku = $("pm-sku").value.trim();
        const category = $("pm-category").value;
        const status = $("pm-status").value;
        const price = Number($("pm-price").value);
        const moq = Number($("pm-moq").value);
        const shortDesc = $("pm-shortDesc").value.trim();

        if (name.length < 2 || name.length > 200 || !sku || !category) throw new Error("Complete the required product fields.");
        if (!Number.isFinite(price) || price < 0) throw new Error("Invalid price.");
        if (!Number.isSafeInteger(moq) || moq <= 0) throw new Error("MOQ must be a positive whole number.");

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
        const imageUrl = $("pm-image-url").value.trim();

        const data = { name, slug, sku, category, status, price, moq, shortDesc };
        if (imageUrl) data.images = [imageUrl];

        if (id) {
            await updateDoc(doc(db, "products", id), data);
        } else {
            await addDoc(collection(db, "products"), data);
        }

        $("product-modal").style.display = "none";
        window.showToast("Product saved.");
        await loadAdminData();
    } catch (error) {
        window.showToast(error?.message || "Error saving product.", "error");
    } finally {
        button.disabled = false;
    }
});

$("cms-settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdminSession) return;

    try {
        await setDoc(doc(db, "siteSettings", "main"), {
            siteName: $("cms-sitename").value.trim().slice(0, 100),
            contactPhone: $("cms-phone").value.trim().slice(0, 30),
            contactEmail: $("cms-email").value.trim().slice(0, 254),
            contactAddress: $("cms-address").value.trim().slice(0, 500),
            workingHours: $("cms-hours").value.trim().slice(0, 200)
        }, { merge: true });

        window.showToast("Settings saved.");
    } catch (error) {
        window.showToast("Failed to save settings.", "error");
    }
});

$("add-admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("add-admin-btn");
    const targetEmail = $("new-admin-email").value.trim().toLowerCase();
    button.disabled = true;

    try {
        const manageAdmin = httpsCallable(functions, "manageAdmin");
        await manageAdmin({ email: targetEmail, action: "add" });
        $("new-admin-email").value = "";
        window.showToast("Admin privileges granted.");
        await loadAdminData();
    } catch (error) {
        window.showToast(error?.message || "Failed to add admin.", "error");
    } finally {
        button.disabled = false;
    }
});

window.removeAdmin = async (email) => {
    if (email.toLowerCase() === (auth.currentUser?.email || "").toLowerCase()) {
        return window.showToast("Cannot remove yourself.", "error");
    }
    if (!confirm(`Revoke admin access for ${email}?`)) return;

    try {
        const manageAdmin = httpsCallable(functions, "manageAdmin");
        await manageAdmin({ email, action: "remove" });
        window.showToast("Admin removed.");
        await loadAdminData();
    } catch (error) {
        window.showToast(error?.message || "Failed to remove admin.", "error");
    }
};

window.deleteDocHandler = async (collectionName, id) => {
    if (!isAdminSession || !["products", "categories"].includes(collectionName)) return;
    if (!confirm("Are you sure?")) return;

    try {
        await deleteDoc(doc(db, collectionName, id));
        window.showToast("Deleted.");
        await loadAdminData();
    } catch (error) {
        window.showToast("Delete failed.", "error");
    }
};

window.viewOrder = (id) => {
    const order = cachedOrders.get(id);
    if (!order) return window.showToast("Order not found.", "error");

    const lines = (order.items || []).map((item) =>
        `${item.name || item.productId} — ${item.qty} × ₹${item.unitPrice}`
    ).join("\n");

    alert(
        `Order: ${id}\n` +
        `Company: ${order.companyName || "—"}\n` +
        `Phone: ${order.phone || "—"}\n` +
        `Email: ${order.customerEmail || "—"}\n` +
        `Status: ${order.status || "—"}\n` +
        `Total: ₹${order.totalAmount || 0}\n` +
        `Created: ${formatTimestamp(order.createdAt)}\n\n` +
        `Items:\n${lines || "—"}\n\n` +
        `Address:\n${order.deliveryAddress || "—"}`
    );
};

document.querySelectorAll(".modal-close").forEach((button) => {
    button.addEventListener("click", () => {
        const modal = button.closest(".modal-overlay");
        if (modal) modal.style.display = "none";
    });
});
