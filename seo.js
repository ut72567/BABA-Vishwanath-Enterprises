
export function setSEO({ title, description, keywords, ogImage }) {  
    if(title) {  
        document.title = `${title} | Baba Plastic`;  
        updateMeta('og:title', title);  
    }  
    if(description) {  
        updateMeta('description', description);  
        updateMeta('og:description', description);  
    }  
    if(keywords) updateMeta('keywords', keywords);  
    if(ogImage) updateMeta('og:image', ogImage);  
}  
function updateMeta(name, content) {  
    let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);  
    if(!el) {  
        el = document.createElement('meta');  
        name.startsWith('og:') ? el.setAttribute('property', name) : el.setAttribute('name', name);  
        document.head.appendChild(el);  
    }  
    el.setAttribute('content', content);  
}  
export function injectProductSchema(product) {  
    const schema = {  
        "@context": "https://schema.org/",  
        "@type": "Product",  
        "name": product.name,  
        "image": product.images || [],  
        "description": product.description,  
        "sku": product.sku,  
        "brand": { "@type": "Brand", "name": "Baba Plastic" }  
    };  
    if(product.status !== 'bulk_enquiry' && product.status !== 'showcase_only') {  
        schema.offers = {  
            "@type": "AggregateOffer",  
            "priceCurrency": "INR",  
            "lowPrice": product.price,  
            "availability": product.status === 'out_of_stock' ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"  
        };  
    }  
    const script = document.createElement('script');  
    script.type = "application/ld+json";  
    script.text = JSON.stringify(schema);  
    document.head.appendChild(script);  
}
