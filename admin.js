import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml,
    safeUrl,
    formatTimestamp
} from "./utils.js";


/* ==================================================
   ADMIN
================================================== */

const ADMIN_EMAIL = "tripathivlogs39@gmail.com";

let isAdminSession = false;
let cachedProducts = new Map();
let cachedOrders = new Map();

const $ = (id) => document.getElementById(id);


/* ==================================================
   ADMIN TAB NAVIGATION
================================================== */

document.querySelectorAll(".admin-menu a[data-tab]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
        event.preventDefault();

        document
            .querySelectorAll(".admin-menu a[data-tab]")
            .forEach((item) => item.classList.remove("active"));

        document
            .querySelectorAll(".tab-content")
            .forEach((content) => content.classList.remove("active"));

        tab.classList.add("active");

        $(tab.dataset.tab)?.classList.add("active");
    });
});


/* ==================================================
   ADMIN LOGIN
================================================== */

$("admin-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("a-login-btn");

    const email = $("a-email").value.trim().toLowerCase();
    const password = $("a-password").value;

    if (email !== ADMIN_EMAIL.toLowerCase()) {
        window.showToast(
            "This email is not authorized as admin.",
            "error"
        );
        return;
    }

    button.disabled = true;
    button.textContent = "Signing in...";

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );
    } catch (error) {
        console.error("Admin login error:", error);

        window.showToast(
            "Incorrect admin email or password.",
            "error"
        );

        button.disabled = false;
        button.textContent = "Secure Login";
    }
});


/* ==================================================
   LOGOUT
================================================== */

$("admin-logout")?.addEventListener("click", async (event) => {
    event.preventDefault();

    await signOut(auth);
    window.location.reload();
});


/* ==================================================
   AUTH STATE
================================================== */

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    if (
        !user.email ||
        user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
    ) {
        window.showToast(
            "Not authorized.",
            "error"
        );

        await signOut(auth);
        return;
    }

    try {
        isAdminSession = true;

        $("admin-auth-overlay").style.display = "none";
        $("admin-dashboard-layout").style.display = "flex";

        await loadAdminData();

    } catch (error) {
        console.error("Admin initialization error:", error);

        window.showToast(
            "Unable to load admin panel.",
            "error"
        );
    }
});


/* ==================================================
   LOAD ADMIN DATA
================================================== */

async function loadAdminData() {
    if (!isAdminSession) return;

    try {

        const productsSnap =
            await getDocs(collection(db, "products"));

        const ordersSnap =
            await getDocs(collection(db, "orders"));

        const catsSnap =
            await getDocs(collection(db, "categories"));

        const settingsSnap =
            await getDoc(
                doc(db, "siteSettings", "main")
            );


        /* ==========================================
           CACHE PRODUCTS
        ========================================== */

        cachedProducts = new Map(
            productsSnap.docs.map((item) => [
                item.id,
                {
                    id: item.id,
                    ...item.data()
                }
            ])
        );


        /* ==========================================
           CACHE ORDERS
        ========================================== */

        cachedOrders = new Map(
            ordersSnap.docs.map((item) => [
                item.id,
                {
                    id: item.id,
                    ...item.data()
                }
            ])
        );


        /* ==========================================
           DASHBOARD STATS
        ========================================== */

        if ($("stat-prods")) {
            $("stat-prods").textContent =
                String(productsSnap.size);
        }

        if ($("stat-orders")) {
            $("stat-orders").textContent =
                String(ordersSnap.size);
        }


        /* ==========================================
           PRODUCTS
        ========================================== */

        const productTable =
            $("admin-products-table")?.querySelector("tbody");

        if (productTable) {

            productTable.innerHTML =
                productsSnap.docs.map((item) => {

                    const p = item.data();

                    return `
                        <tr>

                            <td>
                                <img
                                    src="${safeUrl(
                                        p.images?.[0],
                                        "https://via.placeholder.com/50"
                                    )}"
                                    width="40"
                                    height="40"
                                    style="object-fit:cover;border-radius:4px;"
                                    alt=""
                                >
                            </td>

                            <td>
                                ${escapeHtml(p.name || "")}
                            </td>

                            <td>
                                ${escapeHtml(p.sku || "")}
                            </td>

                            <td>
                                ${escapeHtml(p.category || "")}
                            </td>

                            <td>
                                ${escapeHtml(p.status || "")}
                            </td>

                            <td>

                                <button
                                    class="action-btn"
                                    type="button"
                                    data-edit-product="${escapeHtml(item.id)}"
                                >
                                    Edit
                                </button>

                                <button
                                    class="action-btn delete"
                                    type="button"
                                    data-delete-product="${escapeHtml(item.id)}"
                                >
                                    Delete
                                </button>

                            </td>

                        </tr>
                    `;

                }).join("") ||
                '<tr><td colspan="6">No products.</td></tr>';
        }


        /* ==========================================
           ORDERS
        ========================================== */

        const orderTable =
            $("admin-orders-table")?.querySelector("tbody");

        if (orderTable) {

            orderTable.innerHTML =
                ordersSnap.docs.map((item) => {

                    const o = item.data();

                    return `
                        <tr>

                            <td>
                                ${escapeHtml(item.id)}
                            </td>

                            <td>
                                ${escapeHtml(o.companyName || "")}
                            </td>

                            <td>
                                ₹${escapeHtml(
                                    String(o.totalAmount || 0)
                                )}
                            </td>

                            <td>
                                ${escapeHtml(o.status || "")}
                            </td>

                            <td>

                                <button
                                    class="action-btn"
                                    type="button"
                                    data-view-order="${escapeHtml(item.id)}"
                                >
                                    View
                                </button>

                            </td>

                        </tr>
                    `;

                }).join("") ||
                '<tr><td colspan="5">No orders.</td></tr>';
        }


        /* ==========================================
           CATEGORIES
        ========================================== */

        const catTable =
            $("admin-cats-table")?.querySelector("tbody");

        if (catTable) {

            catTable.innerHTML =
                catsSnap.docs.map((item) => {

                    const c = item.data();

                    return `
                        <tr>

                            <td>
                                ${escapeHtml(c.name || "")}
                            </td>

                            <td>
                                ${escapeHtml(
                                    String(c.displayOrder ?? 0)
                                )}
                            </td>

                            <td>

                                <button
                                    class="action-btn delete"
                                    type="button"
                                    data-delete-category="${escapeHtml(item.id)}"
                                >
                                    Delete
                                </button>

                            </td>

                        </tr>
                    `;

                }).join("") ||
                '<tr><td colspan="3">No categories.</td></tr>';
        }


        /* ==========================================
           CATEGORY DROPDOWN
        ========================================== */

        const categorySelect = $("pm-category");

        if (categorySelect) {

            categorySelect.innerHTML =
                '<option value="">Select category</option>' +
                catsSnap.docs
                    .sort(
                        (a, b) =>
                            Number(a.data().displayOrder || 0) -
                            Number(b.data().displayOrder || 0)
                    )
                    .map((item) => {

                        const name =
                            item.data().name || "";

                        return `
                            <option value="${escapeHtml(name)}">
                                ${escapeHtml(name)}
                            </option>
                        `;

                    })
                    .join("");
        }


        /* ==========================================
           SETTINGS
        ========================================== */

        if (settingsSnap.exists()) {

            const settings =
                settingsSnap.data();

            if ($("cms-sitename"))
                $("cms-sitename").value =
                    settings.siteName || "";

            if ($("cms-phone"))
                $("cms-phone").value =
                    settings.contactPhone || "";

            if ($("cms-email"))
                $("cms-email").value =
                    settings.contactEmail || "";

            if ($("cms-address"))
                $("cms-address").value =
                    settings.contactAddress || "";

            if ($("cms-hours"))
                $("cms-hours").value =
                    settings.workingHours || "";
        }


        /* ==========================================
           ADMIN DISPLAY
        ========================================== */

        const adminTable =
            $("admin-users-table")?.querySelector("tbody");

        if (adminTable) {

            adminTable.innerHTML = `
                <tr>
                    <td>
                        ${escapeHtml(ADMIN_EMAIL)}
                    </td>

                    <td>
                        <strong>Primary Admin</strong>
                    </td>
                </tr>
            `;
        }

    } catch (error) {

        console.error(
            "loadAdminData Firestore error:",
            error
        );

        window.showToast(
            "Failed to load admin data.",
            "error"
        );

        throw error;
    }
}


/* ==================================================
   PRODUCT TABLE ACTIONS
================================================== */

$("admin-products-table")?.addEventListener(
    "click",
    async (event) => {

        const editId =
            event.target.dataset.editProduct;

        const deleteId =
            event.target.dataset.deleteProduct;

        if (editId) {
            window.editProduct(editId);
        }

        if (deleteId) {
            await window.deleteDocHandler(
                "products",
                deleteId
            );
        }
    }
);


/* ==================================================
   ORDER TABLE
================================================== */

$("admin-orders-table")?.addEventListener(
    "click",
    (event) => {

        const orderId =
            event.target.dataset.viewOrder;

        if (orderId) {
            window.viewOrder(orderId);
        }
    }
);


/* ==================================================
   CATEGORY TABLE
================================================== */

$("admin-cats-table")?.addEventListener(
    "click",
    async (event) => {

        const id =
            event.target.dataset.deleteCategory;

        if (id) {

            await window.deleteDocHandler(
                "categories",
                id
            );
        }
    }
);


/* ==================================================
   OPEN PRODUCT MODAL
================================================== */

window.openProductModal = () => {

    $("product-form").reset();

    $("pm-id").value = "";
    $("pm-image-url").value = "";

    $("pm-title").textContent =
        "Add Product";

    $("product-modal").style.display =
        "flex";
};


/* ==================================================
   EDIT PRODUCT
================================================== */

window.editProduct = (id) => {

    const product =
        cachedProducts.get(id);

    if (!product) {

        return window.showToast(
            "Product not found.",
            "error"
        );
    }

    $("pm-id").value =
        product.id;

    $("pm-name").value =
        product.name || "";

    $("pm-sku").value =
        product.sku || "";

    $("pm-category").value =
        product.category || "";

    $("pm-status").value =
        product.status ||
        "direct_purchase";

    $("pm-price").value =
        Number(product.price || 0);

    $("pm-moq").value =
        Number(product.moq || 1);

    $("pm-image-url").value =
        product.images?.[0] || "";

    $("pm-shortDesc").value =
        product.shortDesc || "";

    $("pm-title").textContent =
        "Edit Product";

    $("product-modal").style.display =
        "flex";
};


/* ==================================================
   ADD CATEGORY
================================================== */

window.openCatModal = async () => {

    const name =
        prompt("Category name:");

    if (!name || !name.trim()) return;

    const displayOrder =
        Number(
            prompt(
                "Display order:",
                "0"
            )
        );

    if (
        !Number.isSafeInteger(displayOrder) ||
        displayOrder < 0
    ) {

        window.showToast(
            "Invalid display order.",
            "error"
        );

        return;
    }

    try {

        await addDoc(
            collection(db, "categories"),
            {
                name:
                    name
                        .trim()
                        .slice(0, 100),

                displayOrder,

                createdAt:
                    new Date()
            }
        );

        window.showToast(
            "Category added."
        );

        await loadAdminData();

    } catch (error) {

        console.error(
            "Add category error:",
            error
        );

        window.showToast(
            "Failed to add category.",
            "error"
        );
    }
};


/* ==================================================
   SAVE PRODUCT
================================================== */

$("product-form")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (!isAdminSession) return;

        const button =
            $("pm-save-btn");

        button.disabled = true;

        try {

            const id =
                $("pm-id").value.trim();

            const name =
                $("pm-name").value.trim();

            const sku =
                $("pm-sku").value.trim();

            const category =
                $("pm-category").value;

            const status =
                $("pm-status").value;

            const price =
                Number(
                    $("pm-price").value
                );

            const moq =
                Number(
                    $("pm-moq").value
                );

            const shortDesc =
                $("pm-shortDesc").value.trim();


            if (
                name.length < 2 ||
                name.length > 200 ||
                !sku ||
                !category
            ) {

                throw new Error(
                    "Complete the required product fields."
                );
            }


            if (
                !Number.isFinite(price) ||
                price < 0
            ) {

                throw new Error(
                    "Invalid price."
                );
            }


            if (
                !Number.isSafeInteger(moq) ||
                moq <= 0
            ) {

                throw new Error(
                    "MOQ must be a positive whole number."
                );
            }


            const slug =
                name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
                    .slice(0, 120);


            const imageUrl =
                $("pm-image-url")
                    .value
                    .trim();


            const data = {

                name,
                slug,
                sku,
                category,
                status,
                price,
                moq,
                shortDesc
            };


            if (imageUrl) {

                data.images = [
                    imageUrl
                ];
            }


            if (id) {

                await updateDoc(
                    doc(db, "products", id),
                    data
                );

            } else {

                await addDoc(
                    collection(db, "products"),
                    data
                );
            }


            $("product-modal")
                .style.display =
                "none";

            window.showToast(
                "Product saved."
            );

            await loadAdminData();

        } catch (error) {

            console.error(
                "Save product error:",
                error
            );

            window.showToast(
                error?.message ||
                "Error saving product.",
                "error"
            );

        } finally {

            button.disabled = false;
        }
    }
);


/* ==================================================
   CMS SETTINGS
================================================== */

$("cms-settings-form")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (!isAdminSession) return;

        try {

            await setDoc(
                doc(
                    db,
                    "siteSettings",
                    "main"
                ),
                {
                    siteName:
                        $("cms-sitename")
                            .value
                            .trim()
                            .slice(0, 100),

                    contactPhone:
                        $("cms-phone")
                            .value
                            .trim()
                            .slice(0, 30),

                    contactEmail:
                        $("cms-email")
                            .value
                            .trim()
                            .slice(0, 254),

                    contactAddress:
                        $("cms-address")
                            .value
                            .trim()
                            .slice(0, 500),

                    workingHours:
                        $("cms-hours")
                            .value
                            .trim()
                            .slice(0, 200)
                },
                {
                    merge: true
                }
            );

            window.showToast(
                "Settings saved."
            );

        } catch (error) {

            console.error(
                "Save settings error:",
                error
            );

            window.showToast(
                "Failed to save settings.",
                "error"
            );
        }
    }
);


/* ==================================================
   DELETE PRODUCT / CATEGORY
================================================== */

window.deleteDocHandler =
    async (collectionName, id) => {

        if (
            !isAdminSession ||
            ![
                "products",
                "categories"
            ].includes(collectionName)
        ) {
            return;
        }

        if (!confirm("Are you sure?")) {
            return;
        }

        try {

            await deleteDoc(
                doc(
                    db,
                    collectionName,
                    id
                )
            );

            window.showToast(
                "Deleted."
            );

            await loadAdminData();

        } catch (error) {

            console.error(
                "Delete error:",
                error
            );

            window.showToast(
                "Delete failed.",
                "error"
            );
        }
    };


/* ==================================================
   VIEW ORDER
================================================== */

window.viewOrder = (id) => {

    const order =
        cachedOrders.get(id);

    if (!order) {

        return window.showToast(
            "Order not found.",
            "error"
        );
    }

    const lines =
        (order.items || [])
            .map(
                (item) =>
                    `${item.name || item.productId} — ${item.qty} × ₹${item.unitPrice}`
            )
            .join("\n");

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


/* ==================================================
   CLOSE MODALS
================================================== */

document
    .querySelectorAll(".modal-close")
    .forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                const modal =
                    button.closest(
                        ".modal-overlay"
                    );

                if (modal) {
                    modal.style.display =
                        "none";
                }
            }
        );
    });