import { getProducts, getCategories } from "./database.js";
import { escapeHtml, safeUrl } from "./utils.js";

let allProducts = [];

document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById("products-grid");
    const filterCat = document.getElementById("filter-categories");
    const searchInput = document.getElementById("search-input");

    const initialCategory = new URLSearchParams(window.location.search).get("category");

    try {
        const categories = await getCategories();
        filterCat.innerHTML =
            `<label><input type="radio" name="cat" value="all" ${!initialCategory ? "checked" : ""}> All Categories</label>` +
            categories.map((category) => `
                <label>
                    <input type="radio" name="cat" value="${escapeHtml(category.name)}" ${initialCategory === category.name ? "checked" : ""}>
                    ${escapeHtml(category.name)}
                </label>
            `).join("");

        allProducts = await getProducts();
        renderProducts(initialCategory);

        filterCat.addEventListener("change", (event) => {
            if (event.target.name === "cat") {
                renderProducts(event.target.value === "all" ? null : event.target.value, searchInput.value);
            }
        });

        searchInput.addEventListener("input", (event) => {
            const checked = document.querySelector('input[name="cat"]:checked');
            renderProducts(checked && checked.value !== "all" ? checked.value : null, event.target.value);
        });
    } catch (error) {
        console.error(error);
        grid.textContent = "Error loading products.";
    }
});

function renderProducts(categoryFilter = null, searchQuery = "") {
    const grid = document.getElementById("products-grid");
    let filtered = allProducts;

    if (categoryFilter) filtered = filtered.filter((p) => p.category === categoryFilter);

    const query = searchQuery.trim().toLowerCase();
    if (query) {
        filtered = filtered.filter((p) =>
            String(p.name || "").toLowerCase().includes(query) ||
            String(p.sku || "").toLowerCase().includes(query)
        );
    }

    if (!filtered.length) {
        grid.innerHTML = "<p>No products found matching your criteria.</p>";
        return;
    }

    grid.innerHTML = filtered.map((p) => `
        <a href="product.html?id=${encodeURIComponent(p.slug || p.id)}" class="card">
            <img src="${safeUrl(p.images?.[0], "https://via.placeholder.com/600x400?text=Baba+Plastic")}" class="card-img" alt="${escapeHtml(p.name)}">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(p.name)}</h3>
                <p style="font-size:14px;color:var(--text-light);margin-bottom:10px;">MOQ: ${escapeHtml(p.moq)}</p>
                ${p.status === "direct_purchase"
                    ? `<span class="badge badge-blue">₹${escapeHtml(p.price)}/${escapeHtml(p.unit || "unit")}</span>`
                    : p.status === "out_of_stock"
                        ? '<span class="badge badge-red">Out of Stock</span>'
                        : '<span class="badge badge-red">Bulk Enquiry</span>'}
            </div>
        </a>
    `).join("");
}
