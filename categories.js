import { getCategories } from "./database.js";
import { escapeHtml, safeUrl } from "./utils.js";

document.addEventListener("DOMContentLoaded", async () => {
    const year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    const grid = document.getElementById("categories-grid");
    try {
        const categories = await getCategories();
        if (!categories.length) {
            grid.innerHTML = '<p style="text-align:center;width:100%;">No categories available.</p>';
            return;
        }

        grid.innerHTML = categories.map((category) => `
            <a href="products.html?category=${encodeURIComponent(category.name)}" class="card" style="text-align:center;display:block;">
                <img src="${safeUrl(category.imageUrl, "https://via.placeholder.com/500x300?text=Category")}" class="card-img" alt="${escapeHtml(category.name)}">
                <div class="card-body">
                    <h3 class="card-title">${escapeHtml(category.name)}</h3>
                    <p>${escapeHtml(category.description || "")}</p>
                </div>
            </a>
        `).join("");
    } catch (error) {
        console.error(error);
        grid.textContent = "Unable to load categories.";
    }
});
